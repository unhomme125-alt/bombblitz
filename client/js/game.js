// game.js — orchestrateur côté client. Connecte le socket, gère la machine
// d'état lobby → playing → roundEnd → playing → gameEnd et relie tous les
// événements Socket.IO à l'UI.

import socket from './socket.js'
import * as ui from './ui.js'
import { renderBomb, updateTimer, explode, resetBomb, penaltyEffect, setArcFastTransition } from './bomb.js'
import * as sfx from './sounds.js'
import * as worldmap from './worldmap.js'

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
let mapFoundCount = 0

const MODE_NAMES = {
  classic: '📖 Classique',
  countries: '🌍 Pays',
  capitals: '🏛️ Capitales',
  math: '➕ Calcul',
  coop: '💣 Coopératif',
  imposteur: '🔴 Imposteur'
}
let coopMode = false // partie coopérative en cours côté client
let impMode = false // partie imposteur en cours côté client
let isImpostor = false // suis-je l'imposteur cette partie ?
let frozenTimer = null // timeout du gel de clavier en cours

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
  impMode = false
  isImpostor = false
  $('arena').classList.remove('imposteur')
  ui.hideImpostorHud()
  ui.hideImpVote()
  ui.hideRoundEnd()
  ui.hideGameEnd()
  switchToGame()
  $('roundInfo').textContent = coopMode
    ? `Coop ${data.round}/${data.totalRounds}`
    : `Manche ${data.round}/${data.totalRounds}`
  $('roundInfo').classList.remove('hidden')
  ui.renderPlayers(players, config.mode)
  ui.clearHistory()
  $('historyPanel').classList.remove('hidden')
  ui.clearAllTyping()
  $('arena').classList.toggle('coop', coopMode)
  resetBomb()
  setArcFastTransition(false)
  if (coopMode) ui.showCoopProgress(0, Math.max(10, players.length * 5))
  else ui.hideCoopProgress()

  // Mini-carte en mode Pays (compétitif ou sous-mode coop).
  const showMap =
    config.mode === 'countries' ||
    (config.mode === 'coop' && config.coopSubMode === 'countries')
  $('mapPanel').classList.toggle('hidden', !showMap)
  if (showMap) {
    $('mapHistory').innerHTML = ''
    $('mapCount').textContent = '0'
    mapFoundCount = 0
    worldmap.renderMap($('worldMap')).then(() => worldmap.resetMap())
  }
})

socket.on('game:turn', (data) => {
  activePlayerId = data.playerId
  timeLimit = data.timeLimit
  lastTickKey = -1
  ui.clearAllTyping() // efface les bulles (le mot trouvé reste jusqu'ici)
  ui.highlightActivePlayer(activePlayerId)
  ui.pointTurnNeedle(players.findIndex((p) => p.id === activePlayerId), players.length)
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
  const p = players.find((x) => x.id === data.playerId)

  if (!data.correct) {
    // Erreur (en coopératif). Même traitement que game:wrongAttempt.
    handleWrong(data.playerId, data.answer)
    return
  }

  // Bonne réponse : flash vert + le mot RESTE affiché jusqu'au prochain tour.
  ui.showAnswerFeedback(data.playerId, true)
  sfx.playCorrect()
  ui.showFoundWord(data.playerId, data.answer)
  ui.addHistoryEntry({
    name: p ? p.username : '?',
    color: p ? p.color : '#fff',
    text: data.answer,
    status: 'correct'
  })

  // Mode Pays : allume le pays sur la carte + historique des pays.
  if (data.mapId) {
    worldmap.lightUp(data.mapId)
    addFoundCountry(data.answer)
  }

  if (data.coop) {
    if (data.progress) ui.showCoopProgress(data.progress.solved, data.progress.needed)
  } else if (p && data.speedPoints != null) {
    p.speedPoints = data.speedPoints
    ui.updatePlayerScore(p.id, p, config.mode)
  }
  if (data.playerId === MY_ID) clearInput()
})

// Mauvaise réponse (compétitif) : diffusée à toute la salle.
socket.on('game:wrongAttempt', (data) => handleWrong(data.playerId, data.answer))

// Affichage commun d'une erreur : bulle rouge + secousse + vibration + son.
function handleWrong(playerId, answer) {
  ui.showAnswerFeedback(playerId, false)
  ui.showWrongTyping(playerId, answer)
  sfx.playFail()
  const p = players.find((x) => x.id === playerId)
  ui.addHistoryEntry({
    name: p ? p.username : '?',
    color: p ? p.color : '#fff',
    text: answer || 'erreur',
    status: 'wrong'
  })
  if (playerId === MY_ID) {
    if (navigator.vibrate) navigator.vibrate(180)
    answerInput.classList.add('rejected')
    setTimeout(() => answerInput.classList.remove('rejected'), 400)
  }
}

socket.on('game:turnTimeout', (data) => {
  explode()
  sfx.playFail()
  const p = players.find((x) => x.id === data.playerId)
  if (p) p.lives = data.lives
  ui.animateLifeLoss(data.playerId, data.lives)
  ui.addHistoryEntry({
    name: p ? p.username : '?',
    color: p ? p.color : '#fff',
    text: 'temps écoulé',
    status: 'timeout'
  })
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
  ui.hideTurnNeedle()
  ui.showRoundEnd(data, players, config.mode, isHost, () =>
    socket.emit('game:ready')
  )
})

socket.on('game:end', (data) => {
  ui.hideRoundEnd()
  ui.hideTurnNeedle()
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

socket.on('coop:bonus', (data) => {
  const total = config.coopTime || 60000
  setArcFastTransition(true)
  updateTimer(Math.min(1, data.newTimeRemaining / total), data.newTimeRemaining / 1000)
  ui.coopBonusFlash(data.streak)
  sfx.playCorrect()
  setTimeout(() => setArcFastTransition(false), 320)
})

socket.on('coop:end', (data) => {
  coopMode = true
  activePlayerId = null
  ui.highlightActivePlayer(null)
  ui.hideTurnNeedle()
  if (!data.victory) explode()
  ui.hideCoopProgress()
  ui.showCoopEnd(data, () => socket.emit('game:start'), isHost)
})

// --- Mode Imposteur (coopératif à traître caché) --------------------------

// Erreur non fatale (ex : pas assez de joueurs) — reste dans le lobby.
socket.on('game:notice', (data) => ui.toast(data.message || 'Action impossible'))

socket.on('impostor:gameStart', (data) => {
  config = data.config
  players = data.players
  impMode = true
  coopMode = false
  isImpostor = false
  ui.hideRoundEnd()
  ui.hideGameEnd()
  ui.hideImpVote()
  switchToGame()
  $('roundInfo').textContent = `🔴 Imposteur · ${data.civilCount} Civils + 1 caché`
  $('roundInfo').classList.remove('hidden')
  ui.renderPlayers(players, 'imposteur')
  ui.clearHistory()
  ui.clearAllTyping()
  $('arena').classList.remove('coop')
  $('arena').classList.add('imposteur')
  $('mapPanel').classList.add('hidden')
  $('historyPanel').classList.remove('hidden')
  ui.hideCoopProgress()
  ui.hideImpostorHud()
  ui.showCoopProgress(0, data.challengesNeeded) // « X / N désamorcés »
  ui.updateSuspicionGauges(data.suspicion)
  // La barre d'actions (appel d'urgence pour tous) s'affiche pour tout le monde.
  ui.showImpostorHud({ isImpostor: false })
  resetBomb()
  setArcFastTransition(false)
  ui.toast('Une bombe, un traître caché… désamorcez ensemble !')
})

// Rôle privé : reçu UNIQUEMENT par l'imposteur.
socket.on('impostor:role', (data) => {
  if (!data.isImpostor) return
  isImpostor = true
  ui.showImpostorHud({ isImpostor: true })
  ui.setSabotageCount(data.sabotagesLeft)
  ui.toast('🔴 Tu es l\'IMPOSTEUR. Sabote au bon moment, reste discret.')
})

socket.on('impostor:turn', (data) => {
  activePlayerId = data.playerId
  ui.clearAllTyping()
  ui.highlightActivePlayer(activePlayerId)
  ui.pointTurnNeedle(players.findIndex((p) => p.id === activePlayerId), players.length)
  showChallenge(data.challenge)
  if (data.progress) ui.showCoopProgress(data.progress.solved, data.progress.needed)
  ui.armSabotage(false) // nouveau tour : sabotage non armé
  setupInput()
  // Le bouton Sabotage n'est cliquable que pendant MON tour.
  if (isImpostor) ui.setSabotageActive(activePlayerId === MY_ID)
})

socket.on('impostor:answerResult', (data) => {
  const p = players.find((x) => x.id === data.playerId)
  if (data.correct) {
    ui.showAnswerFeedback(data.playerId, true)
    sfx.playCorrect()
    ui.showFoundWord(data.playerId, data.word)
    ui.addHistoryEntry({
      name: p ? p.username : '?', color: p ? p.color : '#fff',
      text: `${data.word} (+${Math.round((data.gainMs || 0) / 1000)}s)`, status: 'correct'
    })
  } else {
    handleWrong(data.playerId, data.reason === 'timeout' ? 'temps écoulé' : 'erreur')
  }
  if (data.progress) ui.showCoopProgress(data.progress.solved, data.progress.needed)
  if (data.playerId === MY_ID) clearInput()
})

// Variation immédiate du timer (gain vert / perte rouge) + flash central.
socket.on('impostor:timer', (data) => {
  const total = data.totalTime || config.impostorTime || 60000
  setArcFastTransition(true)
  updateTimer(Math.max(0, Math.min(1, data.fraction)), data.timeRemaining / 1000)
  if (data.deltaMs >= 0) {
    ui.impTimerFlash(`+${Math.round(data.deltaMs / 1000)}s`, true)
    sfx.playCorrect()
  } else {
    ui.impTimerFlash(`${Math.round(data.deltaMs / 1000)}s`, false)
    penaltyEffect()
    sfx.playFail()
  }
  setTimeout(() => setArcFastTransition(false), 320)
})

socket.on('impostor:suspicionUpdate', (data) => {
  ui.updateSuspicionGauges(data.suspicion)
})

// Mon sabotage : mise à jour du compteur (privé).
socket.on('impostor:sabotageResult', (data) => {
  ui.setSabotageCount(data.sabotagesLeft)
  if (data.armed) ui.armSabotage(true)
})

// Cooldown du Freeze (privé, imposteur).
socket.on('impostor:freezeCooldown', (data) => {
  ui.startFreezeCooldown(data.remainingMs)
})

// Un freeze a été appliqué (broadcast, sans dire par qui).
socket.on('impostor:freezeApplied', () => {
  // Aucune trace pour les autres : ressemble à un aléa réseau côté victime.
})

// Je suis la victime du freeze : clavier bloqué + glitch CSS.
socket.on('impostor:frozen', (data) => {
  const dur = data.duration || 4000
  answerInput.disabled = true
  answerInput.classList.add('input-frozen')
  $('impFrozenMsg').classList.remove('hidden')
  if (navigator.vibrate) navigator.vibrate([40, 40, 40])
  if (frozenTimer) clearTimeout(frozenTimer)
  frozenTimer = setTimeout(() => {
    answerInput.classList.remove('input-frozen')
    $('impFrozenMsg').classList.add('hidden')
    if (activePlayerId === MY_ID) { answerInput.disabled = false; answerInput.focus() }
  }, dur)
})

// Appel d'urgence déclenché → écran de vote.
socket.on('impostor:emergencyStarted', (data) => {
  activePlayerId = null
  ui.highlightActivePlayer(null)
  ui.hideTurnNeedle()
  $('inputArea').classList.add('hidden')
  $('spectatorNote').classList.add('hidden')
  ui.armSabotage(false)
  if (data.callerId === MY_ID) ui.markEmergencyUsed()
  const caller = players.find((p) => p.id === data.callerId)
  ui.showImpVote(data.candidates, MY_ID, isHost, {
    callerName: caller ? caller.username : '?',
    timeLimit: data.timeLimit,
    onVote: (targetId) => socket.emit('impostor:vote', { targetId }),
    onForce: () => socket.emit('game:ready')
  })
})

socket.on('impostor:voteProgress', (data) => {
  ui.updateImpVoteProgress(data.voted, data.total)
})

socket.on('impostor:voteResult', (data) => {
  if (data.excluded) {
    const ex = players.find((p) => p.id === data.excluded)
    if (ex) ex.eliminated = true
    ui.eliminatePlayer(data.excluded)
  }
  ui.updateSuspicionGauges(data.suspicion)
  ui.showVoteResult(data, players, () => {
    ui.hideImpVote()
    // Réaffiche la zone de saisie pour le tour suivant (gérée par impostor:turn).
  })
})

socket.on('impostor:end', (data) => {
  impMode = true
  activePlayerId = null
  ui.highlightActivePlayer(null)
  ui.hideTurnNeedle()
  ui.hideImpVote()
  ui.hideImpostorHud()
  if (data.winner === 'impostor' || data.winner == null) explode()
  ui.showImpostorEnd(data, MY_ID, () => socket.emit('game:start'), isHost)
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
  $('turnTimeRange').value = config.turnTime || 10
  $('turnTimeVal').textContent = `${config.turnTime || 10} s`

  // Bascule entre réglages compétitifs, coopératifs et imposteur.
  const isCoop = config.mode === 'coop'
  const isImp = config.mode === 'imposteur'
  $('normalConfig').classList.toggle('hidden', isCoop || isImp)
  $('coopConfig').classList.toggle('hidden', !isCoop)
  $('impConfig').classList.toggle('hidden', !isImp)
  // « Manches » n'a pas de sens en imposteur (une seule partie continue).
  $('roundsConfigRow').classList.toggle('hidden', isImp)
  const impSecs = Math.round((config.impostorTime || 60000) / 1000)
  $('impTimeRange').value = impSecs
  $('impTimeVal').textContent = `${impSecs} secondes`
  // Info dynamique : nombre de Civils selon l'effectif (toujours 1 imposteur).
  $('impRoleInfo').textContent = `Avec ${players.length} joueur${players.length > 1 ? 's' : ''} : ${Math.max(1, players.length - 1)} Civils · 1 Imposteur${players.length < 4 ? ' (4 minimum)' : ''}`

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
  if (isImp) {
    $('guestVariants').textContent = `⏱️ ${Math.round((config.impostorTime || 60000) / 1000)}s · 1 imposteur caché`
  } else if (isCoop) {
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

$('turnTimeRange').addEventListener('input', (e) => {
  $('turnTimeVal').textContent = `${e.target.value} s`
  if (isHost) socket.emit('lobby:setConfig', { turnTime: +e.target.value })
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
$('impTimeRange').addEventListener('input', (e) => {
  $('impTimeVal').textContent = `${e.target.value} secondes`
  if (isHost) socket.emit('lobby:setConfig', { impostorTime: +e.target.value * 1000 })
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

// --- Actions du mode Imposteur (en jeu) -----------------------------------
$('impSabotageBtn').addEventListener('click', () => {
  if (impMode && isImpostor && activePlayerId === MY_ID) socket.emit('impostor:sabotage')
})
$('impEmergencyBtn').addEventListener('click', () => {
  if (impMode) socket.emit('impostor:emergencyCall')
})
$('impFreezeBtn').addEventListener('click', () => {
  if (!impMode || !isImpostor) return
  ui.toggleFreezePicker(players, MY_ID, (targetId) => socket.emit('impostor:freeze', { targetId }))
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
  // En imposteur, on NE diffuse PAS la saisie : le mot ne se révèle qu'à la
  // soumission (sinon on donnerait ses lettres en direct).
  if (impMode) return
  ui.broadcastTyping(MY_ID, answerInput.value) // miroir sur ma propre carte
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

// Ajoute un pays à l'historique sous la carte (le plus récent en premier).
function addFoundCountry(name) {
  if (!name) return
  mapFoundCount += 1
  $('mapCount').textContent = mapFoundCount
  const chip = document.createElement('span')
  chip.className = 'map-chip'
  chip.textContent = name
  $('mapHistory').prepend(chip)
}

// Initialise la bombe SVG dès le chargement.
renderBomb($('bombContainer'))
