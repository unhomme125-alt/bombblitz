// ui.js — manipulation du DOM pour l'écran de jeu : disposition des joueurs
// en cercle, surbrillance du joueur actif, feedback, vies, élimination,
// modales de fin de manche / partie, saisie temps réel et confettis.

const playersEl = () => document.getElementById('players')

// Construit une carte joueur.
function playerCard(p) {
  const initial = p.isBot ? '🤖' : p.username.charAt(0).toUpperCase()
  const el = document.createElement('div')
  el.className = 'player-card'
  el.id = `player-${p.id}`
  el.dataset.id = p.id
  el.innerHTML = `
    <div class="avatar" style="background:${p.color}">${initial}</div>
    <div class="pname">${escapeHtml(p.username)}</div>
    <div class="lives" data-lives></div>
    <div class="pscore" data-score></div>
    <div class="typing-bubble" data-typing></div>
  `
  return el
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  )
}

function hearts(n) {
  return '❤️'.repeat(Math.max(0, n)) || '💀'
}

// (Re)construit toutes les cartes joueurs et les place en cercle.
export function renderPlayers(players, mode) {
  const container = playersEl()
  container.innerHTML = ''
  for (const p of players) {
    const card = playerCard(p)
    container.appendChild(card)
    updatePlayerLives(p.id, p.lives)
    updatePlayerScore(p.id, p, mode)
  }
  positionPlayersInCircle(players, container)
}

// Calcule la position de chaque carte sur un cercle (desktop).
export function positionPlayersInCircle(players, container) {
  const n = players.length
  // En mobile (ligne horizontale), on laisse le CSS gérer : on retire les
  // positions absolues.
  const isMobile = window.matchMedia('(max-width: 768px)').matches
  players.forEach((p, i) => {
    const card = document.getElementById(`player-${p.id}`)
    if (!card) return
    if (isMobile) {
      card.style.left = ''
      card.style.top = ''
      card.style.transform = ''
      return
    }
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2
    const radius = 42 // en % du conteneur
    const x = 50 + Math.cos(angle) * radius
    const y = 50 + Math.sin(angle) * radius
    card.style.left = `${x}%`
    card.style.top = `${y}%`
    card.style.transform = 'translate(-50%, -50%)'
  })
}

export function highlightActivePlayer(playerId) {
  document.querySelectorAll('.player-card').forEach((c) => {
    c.classList.toggle('active', c.dataset.id === playerId)
    if (c.dataset.id !== playerId) clearTyping(c.dataset.id)
  })
}

export function updatePlayerLives(playerId, lives) {
  const card = document.getElementById(`player-${playerId}`)
  if (!card) return
  const el = card.querySelector('[data-lives]')
  if (el) el.textContent = hearts(lives)
}

export function updatePlayerScore(playerId, player, mode) {
  const card = document.getElementById(`player-${playerId}`)
  if (!card) return
  const el = card.querySelector('[data-score]')
  if (!el) return
  const parts = []
  if (player.roundWins) parts.push(`🏆 ${player.roundWins}`)
  if ((mode === 'countries' || mode === 'capitals') && player.speedPoints)
    parts.push(`⚡ ${player.speedPoints}`)
  el.textContent = parts.join('  ')
}

// Flash vert / rouge + micro animation de secousse.
export function showAnswerFeedback(playerId, correct) {
  const card = document.getElementById(`player-${playerId}`)
  if (!card) return
  const cls = correct ? 'flash-good' : 'flash-bad'
  card.classList.remove('flash-good', 'flash-bad')
  // force reflow pour rejouer l'animation
  void card.offsetWidth
  card.classList.add(cls)
  if (!correct) {
    card.classList.add('shake-card')
    setTimeout(() => card.classList.remove('shake-card'), 450)
  }
  setTimeout(() => card.classList.remove(cls), 600)
  if (correct) confetti(card)
}

// Perte de vie : flash rouge sur le cœur.
export function animateLifeLoss(playerId, lives) {
  const card = document.getElementById(`player-${playerId}`)
  if (card) {
    card.classList.add('life-lost')
    setTimeout(() => card.classList.remove('life-lost'), 500)
  }
  updatePlayerLives(playerId, lives)
}

export function eliminatePlayer(playerId) {
  const card = document.getElementById(`player-${playerId}`)
  if (!card) return
  card.classList.add('eliminated')
}

// --- Saisie en temps réel -------------------------------------------------

export function broadcastTyping(playerId, text) {
  const card = document.getElementById(`player-${playerId}`)
  if (!card) return
  const bubble = card.querySelector('[data-typing]')
  if (!bubble) return
  bubble.textContent = text
  bubble.classList.toggle('show', !!text)
}

export function clearTyping(playerId) {
  const card = document.getElementById(`player-${playerId}`)
  const bubble = card?.querySelector('[data-typing]')
  if (bubble) {
    bubble.textContent = ''
    bubble.classList.remove('show')
  }
}

// --- Confettis (sans librairie) -------------------------------------------

function confetti(originEl) {
  const rect = originEl.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const colors = ['#ff6b6b', '#ffe066', '#69db7c', '#4dabf7', '#da77f2']
  const layer = document.createElement('div')
  layer.className = 'confetti-layer'
  for (let i = 0; i < 20; i++) {
    const piece = document.createElement('span')
    const angle = Math.random() * Math.PI * 2
    const dist = 40 + Math.random() * 70
    piece.style.left = `${cx}px`
    piece.style.top = `${cy}px`
    piece.style.background = colors[i % colors.length]
    piece.style.setProperty('--dx', `${Math.cos(angle) * dist}px`)
    piece.style.setProperty('--dy', `${Math.sin(angle) * dist}px`)
    piece.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`)
    layer.appendChild(piece)
  }
  document.body.appendChild(layer)
  setTimeout(() => layer.remove(), 650)
}

// --- Modales --------------------------------------------------------------

const reasonLabel = {
  lastAlive: 'Dernier survivant',
  listExhausted: 'Liste épuisée'
}

export function showRoundEnd(data, players, mode, isHost, onForce) {
  const winner = players.find((p) => p.id === data.winner)
  const overlay = document.getElementById('roundEndModal')
  const board = data.scores
    .slice()
    .sort((a, b) => b.roundWins - a.roundWins || b.speedPoints - a.speedPoints)
    .map(
      (p) => `
      <div class="rank-row ${p.id === data.winner ? 'is-winner' : ''}">
        <span class="rk-name"><span class="dot" style="background:${p.color}"></span>${escapeHtml(p.username)}</span>
        <span class="rk-score">🏆 ${p.roundWins}${(mode === 'countries' || mode === 'capitals') ? `   ⚡ ${p.speedPoints}` : ''}</span>
      </div>`
    )
    .join('')

  overlay.querySelector('.modal').innerHTML = `
    <h2 class="re-title">Manche terminée !</h2>
    <p class="re-reason">${reasonLabel[data.reason] || ''}</p>
    <div class="re-winner" style="color:${winner?.color || '#fff'}">
      🎉 ${winner ? escapeHtml(winner.username) : '—'}
    </div>
    <div class="rank-board">${board}</div>
    <p class="re-count" id="reCount"></p>
    ${isHost ? '<button class="btn btn-primary" id="forceNext">Manche suivante</button>' : '<p class="re-wait">En attente de l\'hôte…</p>'}
  `
  overlay.classList.remove('hidden')

  if (isHost) {
    overlay.querySelector('#forceNext').addEventListener('click', () => {
      onForce()
    })
  }

  // Compte à rebours 5s (informatif ; le serveur enchaîne automatiquement).
  let n = 5
  const countEl = overlay.querySelector('#reCount')
  countEl.textContent = `Prochaine manche dans ${n}s…`
  const iv = setInterval(() => {
    n -= 1
    if (n <= 0) {
      clearInterval(iv)
      countEl.textContent = ''
      return
    }
    countEl.textContent = `Prochaine manche dans ${n}s…`
  }, 1000)
  overlay._countdown = iv
}

export function hideRoundEnd() {
  const overlay = document.getElementById('roundEndModal')
  if (overlay._countdown) clearInterval(overlay._countdown)
  overlay.classList.add('hidden')
}

export function showGameEnd(data, onReplay, isHost) {
  const overlay = document.getElementById('gameEndModal')
  const scores = data.finalScores
  const podium = scores
    .slice(0, 3)
    .map((p, i) => {
      const medals = ['🥇', '🥈', '🥉']
      return `
        <div class="podium-spot spot-${i}">
          <div class="medal">${medals[i]}</div>
          <div class="avatar" style="background:${p.color}">${escapeHtml(p.username.charAt(0).toUpperCase())}</div>
          <div class="pp-name">${escapeHtml(p.username)}</div>
          <div class="pp-score">🏆 ${p.roundWins}${p.speedPoints ? ` · ⚡ ${p.speedPoints}` : ''}</div>
        </div>`
    })
    .join('')

  overlay.querySelector('.modal').className = 'modal'
  overlay.querySelector('.modal').innerHTML = `
    <h2 class="ge-title">🏁 Partie terminée</h2>
    <div class="champion">Champion : <strong>${escapeHtml(scores[0]?.username || '—')}</strong></div>
    <div class="podium">${podium}</div>
    ${isHost ? '<button class="btn btn-primary" id="replayBtn">Rejouer</button>' : '<p class="re-wait">L\'hôte peut relancer une partie.</p>'}
    <a href="index.html" class="btn" style="display:inline-block;margin-top:0.6rem;text-decoration:none">Quitter</a>
  `
  overlay.classList.remove('hidden')
  if (isHost) {
    overlay.querySelector('#replayBtn').addEventListener('click', onReplay)
  }
}

export function hideGameEnd() {
  document.getElementById('gameEndModal').classList.add('hidden')
}

// --- Mode Coopératif ------------------------------------------------------

export function showCoopProgress(solved, needed) {
  const wrap = document.getElementById('coopProgress')
  const fill = document.getElementById('coopProgressFill')
  const label = document.getElementById('coopProgressLabel')
  if (!wrap) return
  wrap.classList.remove('hidden')
  const pct = needed ? Math.min(100, (solved / needed) * 100) : 0
  if (fill) fill.style.width = `${pct}%`
  if (label) label.textContent = `${solved} / ${needed} désamorcés 🔧`
}

export function hideCoopProgress() {
  const wrap = document.getElementById('coopProgress')
  if (wrap) wrap.classList.add('hidden')
}

// Message central animé (scale 0→1.2→1, fondu). Pénalité (rouge) par défaut,
// ou bonus de série (vert).
function coopFlash(text, bonus) {
  const el = document.getElementById('coopFlash')
  if (!el) return
  el.textContent = text
  el.classList.toggle('bonus', !!bonus)
  el.classList.remove('hidden', 'animate')
  void el.offsetWidth
  el.classList.add('animate')
  setTimeout(() => el.classList.add('hidden'), 1000)
}

export function coopPenaltyFlash() {
  coopFlash('⚡ TEMPS ACCÉLÉRÉ !', false)
}

export function coopBonusFlash(streak) {
  coopFlash(`⏱️ +TEMPS ! SÉRIE DE ${streak} 🔥`, true)
}

// Écran de fin coopératif (victoire verte qui pulse / défaite avec explosion).
export function showCoopEnd(data, onReplay, isHost) {
  const overlay = document.getElementById('gameEndModal')
  const stats = data.players
    .slice()
    .sort((a, b) => b.coopSolved - a.coopSolved)
    .map(
      (p) => `
      <div class="rank-row">
        <span class="rk-name"><span class="dot" style="background:${p.color}"></span>${p.isBot ? '🤖 ' : ''}${escapeHtml(p.username)}</span>
        <span class="rk-score">${p.coopSolved} 🔧</span>
      </div>`
    )
    .join('')

  const secLeft = Math.ceil((data.timeRemaining || 0) / 1000)
  const body = data.victory
    ? `
      <h2 class="ge-title">💥 BOMBE DÉSAMORCÉE !</h2>
      <p class="champion">Vous avez résolu <strong>${data.solved}/${data.needed}</strong> challenges avec ${secLeft}s d'avance 🎉</p>
      <div class="rank-board">${stats}</div>`
    : `
      <h2 class="ge-title" style="color:var(--accent)">💀 VOUS AVEZ ÉCHOUÉ</h2>
      <p class="champion">La bombe a explosé. <strong>${data.solved}/${data.needed}</strong> challenges résolus — temps restant : 0s.</p>
      <div class="rank-board">${stats}</div>`

  overlay.querySelector('.modal').className = `modal ${data.victory ? 'coop-victory' : 'coop-defeat'}`
  overlay.querySelector('.modal').innerHTML = `
    ${body}
    ${isHost ? '<button class="btn btn-primary" id="replayBtn">Rejouer</button>' : '<p class="re-wait">L\'hôte peut relancer une partie.</p>'}
    <a href="index.html" class="btn" style="display:inline-block;margin-top:0.6rem;text-decoration:none">Quitter</a>
  `
  overlay.classList.remove('hidden')
  if (isHost) overlay.querySelector('#replayBtn').addEventListener('click', onReplay)
}

export function toast(msg) {
  const t = document.createElement('div')
  t.className = 'toast'
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 2600)
}
