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
    <div class="suspicion hidden" data-suspicion></div>
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

// Aiguille de tour : pivote vers le joueur d'index `index` (sur `total`),
// placés en cercle. On accumule l'angle pour toujours tourner dans le sens
// horaire, comme une aiguille de montre. Masquée en disposition mobile (ligne).
let needleAngle = 0
export function pointTurnNeedle(index, total) {
  const needle = document.getElementById('turnNeedle')
  if (!needle) return
  const isMobile = window.matchMedia('(max-width: 768px)').matches
  if (isMobile || total <= 0 || index < 0) {
    needle.style.display = 'none'
    return
  }
  needle.style.display = 'block'
  // Le joueur i est positionné à i*(360/n) degrés en partant du haut (cercle).
  const desired = (index / total) * 360
  const current = ((needleAngle % 360) + 360) % 360
  const delta = (((desired - current) % 360) + 360) % 360 // 0..360 vers l'avant
  needleAngle += delta
  needle.style.transform = `rotate(${needleAngle}deg)`
}

export function hideTurnNeedle() {
  const needle = document.getElementById('turnNeedle')
  if (needle) needle.style.display = 'none'
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

// Affiche en direct ce que le joueur tape (état « saisie »).
export function broadcastTyping(playerId, text) {
  const bubble = bubbleOf(playerId)
  if (!bubble) return
  bubble.textContent = text
  bubble.classList.remove('wrong', 'found')
  bubble.classList.toggle('show', !!text)
}

function bubbleOf(playerId) {
  const card = document.getElementById(`player-${playerId}`)
  return card ? card.querySelector('[data-typing]') : null
}

// Erreur : la bulle devient rouge et vibre (la carte tremble aussi).
export function showWrongTyping(playerId, text) {
  const card = document.getElementById(`player-${playerId}`)
  const bubble = bubbleOf(playerId)
  if (bubble) {
    if (text) bubble.textContent = text
    bubble.classList.remove('found')
    bubble.classList.add('show', 'wrong')
    bubble.classList.remove('shake-bubble')
    void bubble.offsetWidth
    bubble.classList.add('shake-bubble')
  }
  if (card) {
    card.classList.add('shake-card')
    setTimeout(() => card.classList.remove('shake-card'), 450)
  }
}

// Bonne réponse : la bulle devient verte et le mot RESTE jusqu'au prochain tour.
export function showFoundWord(playerId, word) {
  const bubble = bubbleOf(playerId)
  if (!bubble) return
  bubble.textContent = (word || '').toUpperCase()
  bubble.classList.remove('wrong')
  bubble.classList.add('show', 'found')
}

export function clearTyping(playerId) {
  const bubble = bubbleOf(playerId)
  if (bubble) {
    bubble.textContent = ''
    bubble.classList.remove('show', 'wrong', 'found')
  }
}

// Efface toutes les bulles (début d'un nouveau tour).
export function clearAllTyping() {
  document.querySelectorAll('[data-typing]').forEach((b) => {
    b.textContent = ''
    b.classList.remove('show', 'wrong', 'found')
  })
}

// --- Historique des réponses (coin de l'écran) ----------------------------
export function addHistoryEntry({ name, color, text, status }) {
  const list = document.getElementById('answerHistory')
  if (!list) return
  const row = document.createElement('div')
  row.className = `hist-row hist-${status}`
  const icon = status === 'correct' ? '🟢' : status === 'wrong' ? '🔴' : '💥'
  row.innerHTML = `<span class="hist-ico">${icon}</span>` +
    `<span class="hist-name" style="color:${color}">${escapeHtml(name)}</span>` +
    `<span class="hist-word">${escapeHtml(text || '')}</span>`
  list.prepend(row)
  // Limite la taille de l'historique.
  while (list.children.length > 30) list.removeChild(list.lastChild)
}

export function clearHistory() {
  const list = document.getElementById('answerHistory')
  if (list) list.innerHTML = ''
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

// --- Mode Imposteur (coopératif à traître caché) --------------------------

// Affiche / masque la barre d'actions. L'appel d'urgence est visible par tous ;
// les boutons Sabotage/Freeze et le compteur n'apparaissent que pour l'imposteur.
export function showImpostorHud({ isImpostor }) {
  const actions = document.getElementById('impActions')
  if (actions) actions.classList.remove('hidden')
  document.getElementById('impSabotageBtn')?.classList.toggle('hidden', !isImpostor)
  document.getElementById('impFreezeBtn')?.classList.toggle('hidden', !isImpostor)
  document.getElementById('impSabotageDots')?.classList.toggle('hidden', !isImpostor)
  const em = document.getElementById('impEmergencyBtn')
  if (em) { em.disabled = false; em.classList.remove('used') }
  const st = document.getElementById('impEmergencyState')
  if (st) st.textContent = '(1)'
}

// Marque l'appel d'urgence comme utilisé (1 par joueur et par partie).
export function markEmergencyUsed() {
  const em = document.getElementById('impEmergencyBtn')
  if (em) { em.disabled = true; em.classList.add('used') }
  const st = document.getElementById('impEmergencyState')
  if (st) st.textContent = '(utilisé)'
}

export function hideImpostorHud() {
  document.getElementById('impActions')?.classList.add('hidden')
  document.getElementById('impSabotageBtn')?.classList.add('hidden')
  document.getElementById('impFreezeBtn')?.classList.add('hidden')
  document.getElementById('impSabotageDots')?.classList.add('hidden')
  document.getElementById('impFreezePicker')?.classList.add('hidden')
  document.getElementById('impFrozenMsg')?.classList.add('hidden')
  document.querySelectorAll('.suspicion').forEach((s) => s.classList.add('hidden'))
}

// Compteur de sabotages restants : ●●● → ●●○ → ●○○ → ○○○.
export function setSabotageCount(left) {
  const dots = document.getElementById('impSabotageDots')
  if (!dots) return
  const total = 3
  let html = ''
  for (let i = 0; i < total; i++) html += `<span class="sab-dot ${i < left ? 'on' : 'off'}">●</span>`
  dots.innerHTML = html
  dots.dataset.left = left
  const btn = document.getElementById('impSabotageBtn')
  if (btn && left <= 0) { btn.disabled = true; btn.classList.add('depleted') }
}

// Active/désactive le bouton Sabotage selon que c'est mon tour.
export function setSabotageActive(active) {
  const btn = document.getElementById('impSabotageBtn')
  const dots = document.getElementById('impSabotageDots')
  const left = dots ? +(dots.dataset.left || 0) : 0
  if (btn) btn.disabled = !active || left <= 0
}

// Reflet visuel du sabotage armé (le bouton « brille » jusqu'à la soumission).
export function armSabotage(armed) {
  document.getElementById('impSabotageBtn')?.classList.toggle('armed', !!armed)
}

// Cooldown du Freeze : décompte affiché sur le bouton en temps réel.
let freezeInterval = null
export function startFreezeCooldown(remainingMs) {
  const btn = document.getElementById('impFreezeBtn')
  if (!btn) return
  if (freezeInterval) clearInterval(freezeInterval)
  let end = Date.now() + remainingMs
  const render = () => {
    const left = Math.max(0, end - Date.now())
    if (left <= 0) {
      clearInterval(freezeInterval); freezeInterval = null
      btn.disabled = false
      btn.textContent = '⌨️ Freeze'
      return
    }
    btn.disabled = true
    btn.textContent = `⌨️ ${Math.ceil(left / 1000)}s`
  }
  render()
  freezeInterval = setInterval(render, 250)
}

// Sélecteur de cible du Freeze (avatars des autres joueurs non exclus).
export function toggleFreezePicker(players, myId, onPick) {
  const picker = document.getElementById('impFreezePicker')
  if (!picker) return
  if (!picker.classList.contains('hidden')) { picker.classList.add('hidden'); return }
  picker.innerHTML = players
    .filter((p) => p.id !== myId && !p.eliminated)
    .map(
      (p) => `<button class="freeze-target" data-id="${p.id}">
        <span class="avatar" style="background:${p.color}">${p.isBot ? '🤖' : escapeHtml(p.username.charAt(0).toUpperCase())}</span>
        <span>${escapeHtml(p.username)}</span>
      </button>`
    )
    .join('')
  picker.classList.remove('hidden')
  picker.querySelectorAll('.freeze-target').forEach((b) => {
    b.addEventListener('click', () => {
      onPick(b.dataset.id)
      picker.classList.add('hidden')
    })
  })
}

// Met à jour les jauges de suspicion (0-5 👁️) sous chaque avatar.
export function updateSuspicionGauges(suspicion) {
  if (!suspicion) return
  for (const [id, level] of Object.entries(suspicion)) {
    const card = document.getElementById(`player-${id}`)
    if (!card) continue
    const el = card.querySelector('[data-suspicion]')
    if (!el) continue
    el.classList.remove('hidden')
    const n = Math.max(0, Math.min(5, level))
    el.textContent = '👁️'.repeat(n) || '·'
    el.classList.toggle('hot', n >= 3)
  }
}

// Flash central de gain (+Xs, vert) ou perte (-Xs, rouge) de temps.
export function impTimerFlash(text, positive) {
  const el = document.getElementById('impTimerFlash')
  if (!el) return
  el.textContent = text
  el.classList.toggle('gain', !!positive)
  el.classList.toggle('loss', !positive)
  el.classList.remove('hidden', 'animate')
  void el.offsetWidth
  el.classList.add('animate')
  setTimeout(() => el.classList.add('hidden'), 900)
}

// Modale de vote d'urgence (15 s, votes cachés, révélation simultanée).
export function showImpVote(candidates, myId, isHost, { onVote, onForce, callerName, timeLimit }) {
  const overlay = document.getElementById('impVoteModal')
  if (!overlay) return
  const buttons = candidates
    .map(
      (c) => `
      <button class="imp-vote-btn" data-id="${c.id}" ${c.id === myId ? 'disabled' : ''}>
        <span class="dot" style="background:${c.color}"></span>
        ${c.isBot ? '🤖 ' : ''}${escapeHtml(c.username)}${c.id === myId ? ' (toi)' : ''}
      </button>`
    )
    .join('')

  overlay.querySelector('.modal').className = 'modal imp-vote-modal'
  overlay.querySelector('.modal').innerHTML = `
    <h2 class="re-title">🚨 Vote d'urgence</h2>
    <p class="re-reason">Appel lancé par <strong>${escapeHtml(callerName || '?')}</strong> · −8s.<br>Qui est l'imposteur ?</p>
    <div class="imp-vote-grid">
      ${buttons}
      <button class="imp-vote-btn vote-none" data-id="">🙅 Personne</button>
    </div>
    <p class="imp-vote-status" id="impVoteStatus"></p>
    <p class="imp-vote-progress" id="impVoteProgress"></p>
    <div class="imp-vote-timer"><span id="impVoteTimerBar"></span></div>
    ${isHost ? '<button class="btn btn-primary" id="impForceTally">Dépouiller maintenant</button>' : ''}
  `
  overlay.classList.remove('hidden')

  overlay.querySelectorAll('.imp-vote-btn').forEach((btn) => {
    if (btn.disabled) return
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.imp-vote-btn').forEach((b) => {
        b.disabled = true
        b.classList.toggle('chosen', b.dataset.id === btn.dataset.id)
      })
      const status = overlay.querySelector('#impVoteStatus')
      if (status) status.textContent = '✅ Vote enregistré — en attente des autres…'
      onVote(btn.dataset.id || null)
    })
  })
  if (isHost) overlay.querySelector('#impForceTally').addEventListener('click', () => onForce())

  // Barre de décompte 15 s (visuelle).
  const bar = overlay.querySelector('#impVoteTimerBar')
  if (bar && timeLimit) {
    bar.style.transition = 'none'
    bar.style.width = '100%'
    void bar.offsetWidth
    bar.style.transition = `width ${timeLimit}ms linear`
    bar.style.width = '0%'
  }
}

export function updateImpVoteProgress(voted, total) {
  const el = document.getElementById('impVoteProgress')
  if (el) el.textContent = `${voted} / ${total} ont voté`
}

export function hideImpVote() {
  const overlay = document.getElementById('impVoteModal')
  if (overlay) overlay.classList.add('hidden')
}

// Révélation du résultat d'un vote (exclusion / pas de majorité), puis reprise.
export function showVoteResult(data, players, onDone) {
  const overlay = document.getElementById('impVoteModal')
  if (!overlay) return onDone && onDone()
  const ex = data.excluded ? players.find((p) => p.id === data.excluded) : null
  let line
  if (ex) {
    line = data.wasImpostor
      ? `🎯 <strong>${escapeHtml(ex.username)}</strong> était l'IMPOSTEUR — exclu !`
      : `❌ <strong>${escapeHtml(ex.username)}</strong> était un Civil… −20s.`
  } else {
    line = '🤝 Pas de majorité — personne n\'est exclu.'
  }
  const status = overlay.querySelector('#impVoteStatus')
  if (status) status.innerHTML = line
  const bar = overlay.querySelector('#impVoteTimerBar')
  if (bar) bar.style.width = '0%'
  // Si la partie continue, on referme la modale après une courte pause.
  if (!data.wasImpostor) setTimeout(() => onDone && onDone(), 1700)
}

// Révélation finale : flip 3D séquentiel des cartes + rôle + sabotages +
// score de discrétion de l'imposteur.
export function showImpostorEnd(data, myId, onReplay, isHost) {
  const overlay = document.getElementById('gameEndModal')
  const win = data.winner
  const title =
    win === 'civils' ? '🛡️ Les Civils gagnent !'
    : win === 'impostor' ? '🔴 L\'Imposteur gagne !'
    : '⏹️ Partie interrompue'

  const reasonLabels = {
    defused: '💣 Bombe désamorcée à temps !',
    explosion: '💥 La bombe a explosé.',
    voteImpostor: '🗳️ L\'imposteur a été démasqué au vote.',
    minority: '🔴 Il ne restait que 2 joueurs — l\'imposteur l\'emporte.',
    aborted: 'Partie interrompue (départ d\'un joueur).'
  }

  const sabLog = (data.sabotageLog || [])
    .map((s) => `tour ${s.turn} (${(s.syllable || '').toUpperCase()})`)
    .join(', ')

  const cards = data.players
    .map((p) => {
      const isImp = p.id === data.impostorId
      const susp = data.suspicion ? (data.suspicion[p.id] || 0) : 0
      return `
        <div class="imp-flip" data-imp="${isImp ? 1 : 0}">
          <div class="imp-flip-inner">
            <div class="imp-flip-front" style="border-color:${p.color}">
              <span class="avatar" style="background:${p.color}">${p.isBot ? '🤖' : escapeHtml(p.username.charAt(0).toUpperCase())}</span>
              <span class="imp-flip-name">${escapeHtml(p.username)}${p.id === myId ? ' (toi)' : ''}</span>
            </div>
            <div class="imp-flip-back ${isImp ? 'is-impostor' : 'is-civil'}">
              <span class="imp-flip-role">${isImp ? '🔴 Imposteur' : '🟢 Civil'}</span>
              <span class="imp-flip-name">${escapeHtml(p.username)}</span>
              <span class="imp-flip-susp">${'👁️'.repeat(Math.min(5, susp)) || '0 👁️'}</span>
            </div>
          </div>
        </div>`
    })
    .join('')

  overlay.querySelector('.modal').className = `modal imp-end ${win === 'civils' ? 'coop-victory' : 'coop-defeat'}`
  overlay.querySelector('.modal').innerHTML = `
    <h2 class="ge-title">${title}</h2>
    <p class="imp-reason">${reasonLabels[data.reason] || ''} <span class="imp-defused">${data.challengesSolved}/${data.challengesNeeded} désamorcés</span></p>
    <div class="imp-flip-grid">${cards}</div>
    <div class="imp-disc">
      🎭 Discrétion de l'imposteur : <strong>${data.discretion}%</strong>
      &nbsp;·&nbsp; Sabotages utilisés : <strong>${data.sabotagesUsed}/3</strong>${sabLog ? ` <span class="imp-sablog">(${sabLog})</span>` : ''}
    </div>
    ${isHost ? '<button class="btn btn-primary" id="replayBtn">Rejouer</button>' : '<p class="re-wait">L\'hôte peut relancer une partie.</p>'}
    <a href="index.html" class="btn" style="display:inline-block;margin-top:0.6rem;text-decoration:none">Quitter</a>
  `
  overlay.classList.remove('hidden')

  // Flip séquentiel (400 ms d'écart) façon démasquage.
  const flips = overlay.querySelectorAll('.imp-flip')
  flips.forEach((f, i) => setTimeout(() => f.classList.add('flipped'), 300 + i * 400))

  if (isHost) overlay.querySelector('#replayBtn').addEventListener('click', onReplay)
}

export function toast(msg) {
  const t = document.createElement('div')
  t.className = 'toast'
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 2600)
}
