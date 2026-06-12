// game.js — orchestrateur côté client. Connecte le socket, gère la machine
// d'état lobby → playing → roundEnd → playing → gameEnd et relie tous les
// événements Socket.IO à l'UI.

import socket from './socket.js'
import * as ui from './ui.js'
import { renderBomb, updateTimer, explode, resetBomb, penaltyEffect, setArcFastTransition } from './bomb.js'
import * as sfx from './sounds.js'

// --- État local -----------------------------------------------------------
let MY_ID = null
let isHost = false
let players = []
let config = { mode: 'classic', rounds: 3, lives: 3 }
let roomCode = null
let activePlayerId = null
let timeLimit = 10
let lastTickKey = -1
let _hostId = null

const MODE_NAMES = {
  classic: '📖 Classique',
  countries: '🌍 Pays',
  capitals: '🏛️ Capitales',
  math: '➕ Calcul',
  coop: '💣 Coopératif'
}
let coopMode = false // partie coopérative en cours côté client

// --- Raccourcis DOM -------------------------------------------------------
const $ = (id) => document.getElementById(id)
const lobbyView = $('lobbyView')
const gameView = $('gameView')
const answerInput = $('answerInput')

// --- Démarrage : lit l'intention déposée par la page d'accueil ------------
const intent = JSON.parse(sessionStorage.getItem('bb:intent') || 'null')
const urlCode = new URLSearchParams(location.search).get('room')

socket.on('connect', () => {
  MY_ID = socket.id
  if (!intent) {
    // Accès direct sans passer par l'accueil : on tente de rejoindre par l'URL.
    if (urlCode) {
      const username = localStorage.getItem('bb:username') || 'Joueur'
      socket.emit('room:join', { code: urlCode, username })
    } else {
      location.href = 'index.html'
    }
    return
  }
  if (intent.action === 'create') {
    socket.emit('room:create', { username: intent.username })
  } else {
    socket.emit('room:join', { code: intent.code, username: intent.username })
  }
})

// --- Événements salle / lobby --------------------------------------------
socket.on('room:joined', (data) => {
  roomCode = data.code
  isHost = data.isHost
  _hostId = data.hostId
  players = data.players
  config = data.config
  $('roomCode').textContent = roomCode
  renderLobby()
  if (intent?.action === 'create') showCreatedModal()
  sessionStorage.removeItem('bb:intent')
})

socket.on('room:playerUpdate', (data) => {
  players = data.players
  config = data.config
  _hostId = data.hostId
  isHost = data.hostId === MY_ID
  if (lobbyView && !lobbyView.classList.contains('hidden')) renderLobby()
})

socket.on('room:hostChanged', (data) => {
  _hostId = data.hostId
  isHost = data.hostId === MY_ID
  if (!gameView.classList.contains('hidden')) {
    // rien de spécial à faire ; les contrôles host des modales se réévaluent
  } else {
    renderLobby()
  }
})

socket.on('room:error', (data) => {
  alert(data.message || 'Erreur')
  location.href = 'index.html'
})

// --- Cycle de jeu ---------------------------------------------------------
socket.on('game:roundStart', (data) => {
  config = data.config
  players = data.players
  coopMode = config.mode === 'coop'
  ui.hideRoundEnd()
  ui.hideGameEnd()
  switchToGame()
  $('roundInfo').textContent = coopMode
    ? `Coop ${data.round}/${data.totalRounds}`
    : `Manche ${data.round}/${data.totalRounds}`
  $('roundInfo').classList.remove('hidden')
  ui.renderPlayers(players, config.mode)
  $('arena').classList.toggle('coop', coopMode)
  resetBomb()
  setArcFastTransition(false)
  if (coopMode) ui.showCoopProgress(0, Math.max(10, players.length * 5))
  else ui.hideCoopProgress()
})

socket.on('game:turn', (data) => {
  activePlayerId = data.playerId
  timeLimit = data.timeLimit
  lastTickKey = -1
  ui.highlightActivePlayer(activePlayerId)
  showChallenge(data.challenge)
  setupInput()
  if (data.coopMode) {
    // En coop, le timer de la bombe est le timer GLOBAL (coop:tick) : on ne
    // réinitialise pas l'arc à chaque tour, on met juste à jour la progression.
    if (data.progress) ui.showCoopProgress(data.progress.solved, data.progress.needed)
  } else {
    resetBomb()
  }
})

socket.on('game:bombTick', (data) => {
  const fraction = timeLimit ? data.timeLeft / timeLimit : 0
  updateTimer(fraction, data.timeLeft)
  // Tic sonore : cadence qui accélère avec l'urgence.
  const ticksPerSec = 1 + Math.floor(data.urgency * 3)
  const key = Math.floor(data.timeLeft * ticksPerSec)
  if (key !== lastTickKey && data.timeLeft > 0) {
    lastTickKey = key
    sfx.playTick(data.urgency)
  }
})

socket.on('game:answerResult', (data) => {
  ui.showAnswerFeedback(data.playerId, !!data.correct)
  if (data.correct) sfx.playCorrect()
  else sfx.playFail()
  ui.clearTyping(data.playerId)

  if (data.coop) {
    // Coopératif : pas de points de rapidité ; on met à jour la progression.
    if (data.progress) ui.showCoopProgress(data.progress.solved, data.progress.needed)
  } else if (data.correct) {
    const p = players.find((x) => x.id === data.playerId)
    if (p && data.speedPoints != null) {
      p.speedPoints = data.speedPoints
      ui.updatePlayerScore(p.id, p, config.mode)
    }
  }
  if (data.playerId === MY_ID) clearInput()
})

socket.on('game:answerRejected', () => {
  ui.showAnswerFeedback(MY_ID, false)
  sfx.playFail()
  answerInput.classList.add('rejected')
  setTimeout(() => answerInput.classList.remove('rejected'), 400)
})

socket.on('game:turnTimeout', (data) => {
  explode()
  sfx.playFail()
  const p = players.find((x) => x.id === data.playerId)
  if (p) p.lives = data.lives
  ui.animateLifeLoss(data.playerId, data.lives)
  if (data.playerId === MY_ID) clearInput()
})

socket.on('game:playerEliminated', (data) => {
  ui.eliminatePlayer(data.playerId)
  const p = players.find((x) => x.id === data.playerId)
  if (p) p.eliminated = true
})

socket.on('game:roundEnd', (data) => {
  // Met à jour les roundWins locaux.
  for (const s of data.scores) {
    const p = players.find((x) => x.id === s.id)
    if (p) { p.roundWins = s.roundWins; p.speedPoints = s.speedPoints }
  }
  activePlayerId = null
  ui.highlightActivePlayer(null)
  ui.showRoundEnd(data, players, config.mode, isHost, () =>
    socket.emit('game:ready')
  )
})

socket.on('game:end', (data) => {
  ui.hideRoundEnd()
  ui.showGameEnd(
    data,
    () => socket.emit('game:start'), // rejouer
    isHost
  )
})

socket.on('game:typing', (data) => {
  if (data.playerId !== MY_ID) ui.broadcastTyping(data.playerId, data.text)
})

// --- Mode Coopératif ------------------------------------------------------

socket.on('coop:tick', (data) => {
  updateTimer(data.fraction, data.timeRemaining / 1000)
  // Tic sonore qui accélère avec l'urgence.
  const urgency = 1 - data.fraction
  const ticksPerSec = 1 + Math.floor(urgency * 3)
  const key = Math.floor((data.timeRemaining / 1000) * ticksPerSec)
  if (key !== lastTickKey && data.timeRemaining > 0) {
    lastTickKey = key
    sfx.playTick(urgency)
  }
})

socket.on('coop:penalty', (data) => {
  const total = config.coopTime || 60000
  setArcFastTransition(true)
  updateTimer(Math.max(0, data.newTimeRemaining / total), data.newTimeRemaining / 1000)
  penaltyEffect()
  ui.coopPenaltyFlash()
  sfx.playFail()
  setTimeout(() => setArcFastTransition(false), 320)
})

socket.on('coop:end', (data) => {
  coopMode = true
  activePlayerId = null
  ui.highlightActivePlayer(null)
  if (!data.victory) explode()
  ui.hideCoopProgress()
  ui.showCoopEnd(data, () => socket.emit('game:start'), isHost)
})

// --- Vue lobby ------------------------------------------------------------
function renderLobby() {
  lobbyView.classList.remove('hidden')
  gameView.classList.add('hidden')
  $('roundInfo').classList.add('hidden')

  // Liste des joueurs.
  const list = $('lobbyPlayers')
  list.innerHTML = players
    .map(
      (p) => `
      <div class="lobby-player">
        <span class="avatar" style="background:${p.color}">${p.isBot ? '🤖' : p.username.charAt(0).toUpperCase()}</span>
        <span>${escapeHtml(p.username)}</span>
        ${p.id === currentHostId() ? '<span class="host-badge">Hôte</span>' : ''}
      </div>`
    )
    .join('')

  // Contrôles hôte vs invité.
  $('hostControls').classList.toggle('hidden', !isHost)
  $('guestInfo').classList.toggle('hidden', isHost)

  // Sélecteur de mode.
  document.querySelectorAll('.mode-btn').forEach((b) => {
    b.classList.toggle('selected', b.dataset.mode === config.mode)
  })
  $('roundsRange').value = config.rounds
  $('roundsVal').textContent = config.rounds
  $('livesRange').value = config.lives
  $('livesVal').textContent = config.lives

  // Bascule entre réglages compétitifs et coopératifs.
  const isCoop = config.mode === 'coop'
  $('normalConfig').classList.toggle('hidden', isCoop)
  $('coopConfig').classList.toggle('hidden', !isCoop)

  // Variantes Blitz / Mort subite (modes compétitifs).
  $('blitzBtn').classList.toggle('selected', !!config.blitz)
  $('sdBtn').classList.toggle('selected', !!config.suddenDeath)
  $('livesRange').disabled = !!config.suddenDeath // mort subite force 1 vie

  // Réglages coopératifs.
  const secs = Math.round((config.coopTime || 60000) / 1000)
  $('coopTimeRange').value = secs
  $('coopTimeVal').textContent = `${secs} secondes`
  document.querySelectorAll('.submode-btn').forEach((b) => {
    b.classList.toggle('selected', b.dataset.submode === config.coopSubMode)
  })

  // Compteur de bots.
  const botCount = players.filter((p) => p.isBot).length
  $('botCount').textContent = botCount
  $('addBotBtn').disabled = players.length >= 8
  $('removeBotBtn').disabled = botCount === 0

  // Récap pour l'invité.
  $('guestMode').textContent = MODE_NAMES[config.mode] || config.mode
  if (isCoop) {
    $('guestVariants').textContent = `${MODE_NAMES[config.coopSubMode]} · ${secs}s`
  } else {
    const variants = []
    if (config.blitz) variants.push('⚡ Blitz')
    if (config.suddenDeath) variants.push('💀 Mort subite')
    $('guestVariants').textContent = variants.join('  ·  ')
  }

  $('startBtn').disabled = players.length < 1
}

function currentHostId() {
  return _hostId
}

// --- Contrôles hôte -------------------------------------------------------
document.querySelectorAll('.mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!isHost) return
    socket.emit('lobby:setMode', { mode: btn.dataset.mode })
  })
})

$('roundsRange').addEventListener('input', (e) => {
  $('roundsVal').textContent = e.target.value
  if (isHost) socket.emit('lobby:setConfig', { rounds: +e.target.value, lives: +$('livesRange').value })
})
$('livesRange').addEventListener('input', (e) => {
  $('livesVal').textContent = e.target.value
  if (isHost) socket.emit('lobby:setConfig', { rounds: +$('roundsRange').value, lives: +e.target.value })
})

$('coopTimeRange').addEventListener('input', (e) => {
  $('coopTimeVal').textContent = `${e.target.value} secondes`
  if (isHost) socket.emit('lobby:setConfig', { coopTime: +e.target.value * 1000 })
})
document.querySelectorAll('.submode-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (isHost) socket.emit('lobby:setConfig', { coopSubMode: btn.dataset.submode })
  })
})

$('blitzBtn').addEventListener('click', () => {
  if (isHost) socket.emit('lobby:setConfig', { blitz: !config.blitz })
})
$('sdBtn').addEventListener('click', () => {
  if (isHost) socket.emit('lobby:setConfig', { suddenDeath: !config.suddenDeath })
})
$('addBotBtn').addEventListener('click', () => {
  if (isHost) socket.emit('lobby:addBot')
})
$('removeBotBtn').addEventListener('click', () => {
  if (isHost) socket.emit('lobby:removeBot')
})

$('startBtn').addEventListener('click', () => {
  if (isHost) socket.emit('game:start')
})

// --- Vue jeu / input ------------------------------------------------------
function switchToGame() {
  lobbyView.classList.add('hidden')
  gameView.classList.remove('hidden')
  ui.hideGameEnd()
}

function showChallenge(challenge) {
  const label = $('challengeLabel')
  const text = $('challengeText')
  if (challenge.type === 'math') {
    label.textContent = 'Calcule'
    text.textContent = `${challenge.text} = ?`
    text.classList.add('mono')
  } else {
    label.textContent = challenge.label || 'Combinaison'
    text.textContent = challenge.text
    text.classList.remove('mono')
  }
}

function setupInput() {
  const isMyTurn = activePlayerId === MY_ID
  const area = $('inputArea')
  area.classList.toggle('hidden', !isMyTurn)
  $('spectatorNote').classList.toggle('hidden', isMyTurn)
  if (isMyTurn) {
    answerInput.value = ''
    answerInput.disabled = false
    answerInput.focus()
  }
}

function clearInput() {
  answerInput.value = ''
}

answerInput.addEventListener('input', () => {
  if (activePlayerId !== MY_ID) return
  socket.emit('game:typing', { text: answerInput.value })
})

answerInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return
  if (activePlayerId !== MY_ID) return
  const answer = answerInput.value.trim()
  if (!answer) return
  socket.emit('game:answer', { answer })
})

// --- Code salle : copie + modale ------------------------------------------
$('copyCode').addEventListener('click', () => copyCode())
function copyCode() {
  navigator.clipboard?.writeText(roomCode).then(
    () => ui.toast('Code copié !'),
    () => ui.toast(roomCode)
  )
}

function showCreatedModal() {
  const m = $('createdModal')
  m.querySelector('[data-code]').textContent = roomCode
  m.classList.remove('hidden')
  m.querySelector('[data-copy]').onclick = () => copyCode()
  m.querySelector('[data-close]').onclick = () => m.classList.add('hidden')
}

// --- Volume ---------------------------------------------------------------
const volSlider = $('volumeSlider')
volSlider.value = sfx.getVolume()
volSlider.addEventListener('input', (e) => sfx.setVolume(+e.target.value))
$('volumeBtn').addEventListener('click', () => {
  $('volumePanel').classList.toggle('hidden')
})

// Débloque l'audio à la première interaction.
;['click', 'keydown'].forEach((ev) =>
  window.addEventListener(ev, () => sfx.unlockAudio(), { once: true })
)

// Recalcule les positions en cercle au redimensionnement.
window.addEventListener('resize', () => {
  if (!gameView.classList.contains('hidden') && players.length)
    ui.positionPlayersInCircle(players, $('players'))
})

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  )
}

// Initialise la bombe SVG dès le chargement.
renderBomb($('bombContainer'))
