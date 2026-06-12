// gameEngine.js — logique de jeu commune à tous les modes.
// Orchestration des manches, tours, timer de bombe, vies et fin de partie.

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { clearRoomTimers, clearCoopTurnTimers, publicPlayers } from './roomManager.js'
import * as classic from './modes/classic.js'
import * as countries from './modes/countries.js'
import * as capitals from './modes/capitals.js'
import * as math from './modes/math.js'
import * as coop from './modes/coop.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const load = (f) => JSON.parse(readFileSync(join(__dirname, 'data', f), 'utf-8'))

// Données chargées une seule fois en mémoire.
const WORDS_ARR = load('words_fr.json')
const WORDS = new Set(WORDS_ARR)
const COUNTRIES = load('countries.json')
const CAPITALS = load('capitals.json')

const TICK_MS = 100
const ROUND_BREAK_MS = 5000 // pause entre deux manches

// ---------------------------------------------------------------------------
// Helpers exportés
// ---------------------------------------------------------------------------

// Points de rapidité (modes pays & capitales).
export function calculateSpeedPoints(elapsedMs) {
  if (elapsedMs < 3000) return 3
  if (elapsedMs < 6000) return 2
  if (elapsedMs < 10000) return 1
  return 0
}

// Index du prochain joueur non éliminé (sens horaire), ou -1 si plus personne.
export function getNextPlayerIndex(players, currentIndex) {
  const n = players.length
  for (let step = 1; step <= n; step++) {
    const idx = (currentIndex + step) % n
    if (!players[idx].eliminated) return idx
  }
  return -1
}

// Vérifie la fin de manche par élimination (dernier survivant).
export function checkRoundEnd(players) {
  const alive = players.filter((p) => !p.eliminated)
  if (alive.length <= 1) {
    return { ended: true, reason: 'lastAlive', winner: alive[0] || null }
  }
  return { ended: false }
}

// Durée du timer de bombe pour la manche courante (en secondes).
// En mode Blitz : beaucoup moins de temps, plancher plus bas.
function bombDuration(room) {
  if (room.config.blitz) {
    const base = room.config.mode === 'math' ? 6 : 4
    return Math.max(2.5, base - 0.3 * (room.currentRound - 1))
  }
  const base = room.config.mode === 'math' ? 15 : 10
  return Math.max(5, base - 0.5 * (room.currentRound - 1))
}

// ---------------------------------------------------------------------------
// Génération / validation déléguées au mode courant
// ---------------------------------------------------------------------------

// En mode coopératif, le type de challenge est défini par le sous-mode.
function effectiveMode(room) {
  return room.config.mode === 'coop' ? room.config.coopSubMode : room.config.mode
}

// Renvoie { challenge (état interne), payload (envoyé au client) }.
function makeChallenge(room) {
  const mode = effectiveMode(room)
  if (mode === 'classic') {
    const syllable = classic.generateChallenge(
      room.usedChallenges, WORDS_ARR, room.successCount
    )
    room.usedChallenges.add(syllable)
    return {
      challenge: { syllable },
      payload: { type: 'combo', text: syllable.toUpperCase() }
    }
  }
  if (mode === 'countries') {
    const c = countries.generateChallenge(room.usedChallenges, COUNTRIES, room.usedAnswers)
    if (!c) return null // liste épuisée
    room.usedChallenges.add(c.syllable)
    return {
      challenge: { syllable: c.syllable },
      payload: { type: 'combo', text: c.syllable.toUpperCase(), label: 'Pays' }
    }
  }
  if (mode === 'capitals') {
    const c = capitals.generateChallenge(room.usedChallenges, CAPITALS, room.usedAnswers)
    if (!c) return null
    room.usedChallenges.add(c.syllable)
    return {
      challenge: { syllable: c.syllable },
      payload: { type: 'combo', text: c.syllable.toUpperCase(), label: 'Capitale' }
    }
  }
  // math
  const m = math.generateChallenge(room.turnNumber)
  return {
    challenge: { answer: m.answer },
    payload: { type: 'math', text: m.expression }
  }
}

// Valide la réponse selon le mode. Renvoie { valid, display, exhausted, reason }.
function validate(room, answer) {
  const mode = effectiveMode(room)
  const ch = room.currentChallenge
  if (mode === 'classic') {
    const r = classic.validateAnswer(ch.syllable, answer, room.usedAnswers, WORDS)
    return { ...r, display: r.normalized }
  }
  if (mode === 'countries') {
    return countries.validateAnswer(ch.syllable, answer, room.usedAnswers, COUNTRIES)
  }
  if (mode === 'capitals') {
    return capitals.validateAnswer(ch.syllable, answer, room.usedAnswers, CAPITALS)
  }
  return math.validateAnswer(ch, answer)
}

// ---------------------------------------------------------------------------
// Cycle de jeu
// ---------------------------------------------------------------------------

export function startGame(room, io) {
  room.currentRound = 0
  for (const p of room.players) p.roundWins = 0
  startRound(room, io)
}

// Initialise et démarre une nouvelle manche.
export function startRound(room, io) {
  if (room.config.mode === 'coop') return startCoopRound(room, io)
  clearRoomTimers(room)
  room.currentRound += 1
  room.state = 'playing'
  room.usedAnswers = new Set()
  room.usedChallenges = new Set()
  room.successCount = 0
  room.turnNumber = 0

  // Réinitialise vies / points / élimination pour la manche.
  // Mort subite : tout le monde n'a qu'une seule vie.
  const lives = room.config.suddenDeath ? 1 : room.config.lives
  for (const p of room.players) {
    p.lives = lives
    p.speedPoints = 0
    p.eliminated = false
  }

  // Le joueur de départ tourne à chaque manche pour l'équité.
  room.currentTurnIndex = (room.currentRound - 1) % room.players.length

  io.to(room.code).emit('game:roundStart', {
    round: room.currentRound,
    totalRounds: room.config.rounds,
    players: publicPlayers(room),
    config: room.config
  })

  startTurn(room, io)
}

// Démarre le tour du joueur courant : génère le challenge et lance la bombe.
export function startTurn(room, io) {
  clearRoomTimers(room)

  const player = room.players[room.currentTurnIndex]
  if (!player || player.eliminated) {
    const next = getNextPlayerIndex(room.players, room.currentTurnIndex)
    if (next === -1) return endRound(room, io)
    room.currentTurnIndex = next
  }

  const active = room.players[room.currentTurnIndex]
  room.turnNumber += 1

  const made = makeChallenge(room)
  if (!made) {
    // Plus aucune réponse possible (liste épuisée) → fin de manche anticipée.
    return endRound(room, io, 'listExhausted')
  }
  room.currentChallenge = made.challenge

  const duration = bombDuration(room)
  room.turnDuration = duration
  room.turnStartTime = Date.now()

  io.to(room.code).emit('game:turn', {
    playerId: active.id,
    challenge: made.payload,
    timeLimit: duration
  })

  // Tics réguliers de la bombe (timeLeft + urgence) pour l'UI / les sons.
  room.tickTimer = setInterval(() => {
    const elapsed = (Date.now() - room.turnStartTime) / 1000
    const timeLeft = Math.max(0, duration - elapsed)
    const urgency = Math.min(1, 1 - timeLeft / duration)
    io.to(room.code).emit('game:bombTick', {
      timeLeft: Number(timeLeft.toFixed(2)),
      urgency: Number(urgency.toFixed(3))
    })
  }, TICK_MS)

  // Explosion au bout du temps imparti.
  room.turnTimer = setTimeout(() => handleTimeout(room, io), duration * 1000)

  // Si le joueur actif est un bot, il joue automatiquement.
  if (active.isBot) scheduleBotMove(room, active, io, duration)
}

// Traite une réponse soumise par un socket (joueur humain).
export function handleAnswer(room, socket, answer, io) {
  if (room.state !== 'playing') return
  if (room.config.mode === 'coop') return handleCoopAnswer(room, socket.id, answer, io)
  const active = room.players[room.currentTurnIndex]
  if (!active || active.id !== socket.id) return // pas son tour

  const result = validate(room, answer)

  if (!result.valid) {
    // Réponse incorrecte : on secoue le joueur mais la bombe continue (style
    // BombParty). La vie n'est perdue qu'à l'explosion du timer.
    socket.emit('game:answerRejected', { reason: result.reason || 'invalid' })
    return
  }
  applyCorrectAnswer(room, active, result, answer, io)
}

// Applique une bonne réponse : points, used, notification, joueur suivant.
function applyCorrectAnswer(room, active, result, rawAnswer, io) {
  const elapsed = Date.now() - room.turnStartTime
  room.usedAnswers.add(result.normalized)
  room.successCount += 1

  if (room.config.mode === 'countries' || room.config.mode === 'capitals') {
    active.speedPoints += calculateSpeedPoints(elapsed)
  }

  clearRoomTimers(room)
  io.to(room.code).emit('game:answerResult', {
    playerId: active.id,
    correct: true,
    answer: result.display || rawAnswer,
    lives: active.lives,
    speedPoints: active.speedPoints
  })

  if (result.exhausted) {
    return endRound(room, io, 'listExhausted')
  }

  const next = getNextPlayerIndex(room.players, room.currentTurnIndex)
  if (next === -1) return endRound(room, io)
  room.currentTurnIndex = next
  // Petit délai pour laisser l'animation « correct » se jouer.
  room.turnTimer = setTimeout(() => startTurn(room, io), 700)
}

// --- Bots -----------------------------------------------------------------

// Trouve une réponse correcte pour le challenge courant, ou null.
function getBotAnswer(room) {
  const mode = effectiveMode(room)
  const ch = room.currentChallenge
  if (mode === 'math') return String(ch.answer)
  if (mode === 'classic') {
    const w = WORDS_ARR.find((x) => x.includes(ch.syllable) && !room.usedAnswers.has(x))
    return w || null
  }
  if (mode === 'countries') {
    const c = COUNTRIES.find((x) => x.norm.includes(ch.syllable) && !room.usedAnswers.has(x.norm))
    return c ? c.name : null
  }
  const c = CAPITALS.find((x) => x.norm.includes(ch.syllable) && !room.usedAnswers.has(x.norm))
  return c ? c.capital : null
}

// Programme le « coup » d'un bot : il répond correctement après un délai
// aléatoire avec une probabilité ~80 %, sinon il laisse la bombe exploser
// (et perd une vie) — pour rester battable.
function scheduleBotMove(room, bot, io, duration) {
  const willAnswer = Math.random() < 0.8
  if (!willAnswer) return

  const answer = getBotAnswer(room)
  if (answer == null) return

  // Délai de « réflexion », toujours strictement inférieur à la bombe.
  const maxDelay = Math.max(0.6, duration - 0.8)
  const delay = 0.7 + Math.random() * Math.max(0.1, maxDelay - 0.7)

  room.botTimer = setTimeout(() => {
    if (room.state !== 'playing') return
    const active = room.players[room.currentTurnIndex]
    if (!active || active.id !== bot.id) return
    const result = validate(room, answer)
    if (result.valid) applyCorrectAnswer(room, active, result, answer, io)
  }, Math.max(300, delay * 1000))
}

// La bombe explose : le joueur courant perd une vie.
export function handleTimeout(room, io) {
  if (room.state !== 'playing') return
  clearRoomTimers(room)

  const active = room.players[room.currentTurnIndex]
  if (!active) return endRound(room, io)

  active.lives -= 1
  io.to(room.code).emit('game:turnTimeout', {
    playerId: active.id,
    lives: active.lives
  })

  if (active.lives <= 0) {
    active.eliminated = true
    io.to(room.code).emit('game:playerEliminated', { playerId: active.id })
  }

  const end = checkRoundEnd(room.players)
  if (end.ended) return endRound(room, io)

  const next = getNextPlayerIndex(room.players, room.currentTurnIndex)
  if (next === -1) return endRound(room, io)
  room.currentTurnIndex = next
  room.turnTimer = setTimeout(() => startTurn(room, io), 1200) // laisse jouer l'explosion
}

// Termine la manche : détermine le gagnant et notifie.
export function endRound(room, io, reason = 'lastAlive') {
  clearRoomTimers(room)
  room.state = 'roundEnd'

  let winner
  if (reason === 'listExhausted') {
    // Le gagnant est celui qui a le plus de points de rapidité.
    winner = [...room.players].sort((a, b) => b.speedPoints - a.speedPoints)[0]
  } else {
    const alive = room.players.filter((p) => !p.eliminated)
    winner =
      alive[0] ||
      [...room.players].sort((a, b) => b.lives - a.lives)[0]
  }
  if (winner) winner.roundWins += 1

  io.to(room.code).emit('game:roundEnd', {
    winner: winner ? winner.id : null,
    scores: publicPlayers(room),
    reason
  })

  // Fin de partie ou manche suivante.
  if (room.currentRound >= room.config.rounds) {
    room.turnTimer = setTimeout(() => endGame(room, io), ROUND_BREAK_MS)
  } else {
    room.turnTimer = setTimeout(() => startRound(room, io), ROUND_BREAK_MS)
  }
}

// Permet à l'hôte de forcer le passage à la suite (manche ou fin).
export function advanceNow(room, io) {
  if (room.state !== 'roundEnd') return
  clearRoomTimers(room)
  if (room.config.mode === 'coop') {
    if (room.currentRound < room.config.rounds) startCoopRound(room, io)
    return // dernière manche coop : on reste sur l'écran de résultat
  }
  if (room.currentRound >= room.config.rounds) endGame(room, io)
  else startRound(room, io)
}

// Fin de partie : classement final.
export function endGame(room, io) {
  clearRoomTimers(room)
  room.state = 'gameEnd'

  const finalScores = [...room.players].sort((a, b) => {
    if (b.roundWins !== a.roundWins) return b.roundWins - a.roundWins
    return b.speedPoints - a.speedPoints
  })

  io.to(room.code).emit('game:end', {
    finalScores: finalScores.map((p) => ({
      id: p.id,
      username: p.username,
      color: p.color,
      roundWins: p.roundWins,
      speedPoints: p.speedPoints
    })),
    champion: finalScores[0] ? finalScores[0].id : null
  })
}

// =========================================================================
// Mode Coopératif — orchestration des tours et du timer global partagé
// =========================================================================

function startCoopRound(room, io) {
  clearRoomTimers(room)
  room.currentRound += 1
  room.state = 'playing'
  room.usedAnswers = new Set()
  room.usedChallenges = new Set()
  for (const p of room.players) { p.eliminated = false; p.coopSolved = 0 }

  room.coop = coop.initCoopRound(room)
  room.currentTurnIndex = (room.currentRound - 1) % room.players.length

  io.to(room.code).emit('game:roundStart', {
    round: room.currentRound,
    totalRounds: room.config.rounds,
    players: publicPlayers(room),
    config: room.config
  })

  // Timer global partagé : tick toutes les 100 ms, défaite si épuisé.
  room.coopGlobalTimer = setInterval(() => {
    if (room.state !== 'playing') return
    const remaining = coop.tickGlobalTimer(room, io)
    if (remaining <= 0) coopEnd(room, io, false)
  }, 100)

  startCoopTurn(room, io)
}

function startCoopTurn(room, io) {
  clearCoopTurnTimers(room)
  if (room.state !== 'playing') return

  const active = room.players[room.currentTurnIndex]
  if (!active) return

  room.coop.turnNumber += 1
  // Synchronise les compteurs lus par makeChallenge (difficulté du sous-mode).
  room.turnNumber = room.coop.turnNumber
  room.successCount = room.coop.challengesSolved

  let made = makeChallenge(room)
  if (!made) {
    // Sous-mode pays/capitales épuisé : on régénère la liste pour continuer.
    room.usedAnswers = new Set()
    made = makeChallenge(room)
    if (!made) return
  }
  room.currentChallenge = made.challenge
  room.turnStartTime = Date.now()

  io.to(room.code).emit('game:turn', {
    playerId: active.id,
    challenge: made.payload,
    timeLimit: 5000,
    coopMode: true,
    progress: { solved: room.coop.challengesSolved, needed: room.coop.challengesNeeded }
  })

  // Timer individuel de 5 s : un dépassement compte comme une erreur.
  room.coopTurnTimer = setTimeout(() => coopFail(room, io, 'timeout'), 5000)

  if (active.isBot) scheduleCoopBotMove(room, active, io)
}

// Réponse coopérative (humain ou bot).
function handleCoopAnswer(room, playerId, answer, io) {
  if (!room.coop || room.state !== 'playing') return
  const active = room.players[room.currentTurnIndex]
  if (!active || active.id !== playerId) return // pas son tour

  const result = validate(room, answer)
  if (!result.valid) return coopFail(room, io, 'wrong')

  // Bonne réponse : aucun changement de timer, challenge suivant immédiat.
  clearCoopTurnTimers(room)
  room.coop.challengesSolved += 1
  room.coop.solvedByPlayer[active.id] = (room.coop.solvedByPlayer[active.id] || 0) + 1
  active.coopSolved = room.coop.solvedByPlayer[active.id]
  if (result.normalized) room.usedAnswers.add(result.normalized)

  io.to(room.code).emit('game:answerResult', {
    playerId: active.id,
    correct: true,
    coop: true,
    answer: result.display || answer,
    progress: { solved: room.coop.challengesSolved, needed: room.coop.challengesNeeded }
  })

  const end = coop.checkCoopEnd(room.coop)
  if (end.ended) return coopEnd(room, io, end.victory)

  room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length
  room.turnTimer = setTimeout(() => startCoopTurn(room, io), 350)
}

// Erreur (mauvaise réponse ou timeout individuel) → pénalité de 10 % du temps.
function coopFail(room, io, reason) {
  if (!room.coop || room.state !== 'playing') return
  clearCoopTurnTimers(room)
  const active = room.players[room.currentTurnIndex]

  const { newTimeRemaining, penaltyMs } = coop.applyPenalty(room.coop)
  io.to(room.code).emit('coop:penalty', {
    newTimeRemaining,
    penaltyMs,
    byPlayerId: active ? active.id : null
  })
  io.to(room.code).emit('game:answerResult', {
    playerId: active ? active.id : null,
    correct: false,
    coop: true,
    reason
  })

  const end = coop.checkCoopEnd(room.coop)
  if (end.ended) return coopEnd(room, io, end.victory)

  room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length
  room.turnTimer = setTimeout(() => startCoopTurn(room, io), 600)
}

// Coup automatique d'un bot en coopératif (répond ~82 %, sinon laisse expirer).
function scheduleCoopBotMove(room, bot, io) {
  if (Math.random() >= 0.82) return
  const answer = getBotAnswer(room)
  if (answer == null) return
  const delay = 700 + Math.random() * 2500 // strictement < 5 s
  room.botTimer = setTimeout(() => {
    if (room.state !== 'playing') return
    const active = room.players[room.currentTurnIndex]
    if (!active || active.id !== bot.id) return
    handleCoopAnswer(room, bot.id, answer, io)
  }, delay)
}

// Fin de la manche coopérative (victoire ou défaite).
function coopEnd(room, io, victory) {
  if (room.state !== 'playing') return // évite une double fin
  clearRoomTimers(room)
  room.state = 'roundEnd'

  io.to(room.code).emit('coop:end', {
    victory,
    timeRemaining: coop.timeLeft(room.coop),
    solved: room.coop.challengesSolved,
    needed: room.coop.challengesNeeded,
    players: room.players.map((p) => ({
      id: p.id,
      username: p.username,
      color: p.color,
      isBot: p.isBot,
      coopSolved: p.coopSolved || 0
    }))
  })

  // Manche suivante automatique, ou écran final si c'était la dernière.
  if (room.currentRound < room.config.rounds) {
    room.turnTimer = setTimeout(() => startCoopRound(room, io), ROUND_BREAK_MS)
  }
}

// Gère le départ/déconnexion d'un joueur pendant une partie.
export function handlePlayerLeftDuringGame(room, leftId, io) {
  if (room.state !== 'playing') return

  // En coopératif : on resserre simplement l'index de tour ; si le joueur actif
  // est parti, son timer de 5 s expirera et appliquera la pénalité comme prévu.
  if (room.config.mode === 'coop') {
    if (room.players.length === 0) return
    room.currentTurnIndex = room.currentTurnIndex % room.players.length
    return
  }
  const idx = room.players.findIndex((p) => p.id === leftId)
  const wasActive = idx === room.currentTurnIndex

  // Le joueur a déjà été retiré du tableau par roomManager.leaveRoom dans le
  // cas d'une déconnexion ; ici on recalcule juste l'état si besoin.
  const end = checkRoundEnd(room.players)
  if (end.ended) return endRound(room, io)

  if (wasActive || idx < room.currentTurnIndex) {
    // Réajuste l'index et relance un tour proprement.
    room.currentTurnIndex = room.currentTurnIndex % room.players.length
    startTurn(room, io)
  }
}

export { WORDS_ARR, COUNTRIES, CAPITALS }
