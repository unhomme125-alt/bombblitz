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
import * as impostor from './modes/impostor.js'

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
// Base = temps par tour choisi dans le lobby ; diminue de 0.5s par manche.
// En mode Blitz : moitié du temps, plancher plus bas.
function bombDuration(room) {
  const base = room.config.turnTime || 10
  if (room.config.blitz) {
    return Math.max(2, base * 0.5 - 0.2 * (room.currentRound - 1))
  }
  return Math.max(3, base - 0.5 * (room.currentRound - 1))
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
  if (room.config.mode === 'imposteur') return startImpostorGame(room, io)
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
  if (room.config.mode === 'imposteur') return handleImpostorAnswer(room, socket.id, answer, io)
  if (room.config.mode === 'coop') return handleCoopAnswer(room, socket.id, answer, io)
  const active = room.players[room.currentTurnIndex]
  if (!active || active.id !== socket.id) return // pas son tour

  const result = validate(room, answer)

  if (!result.valid) {
    // Réponse incorrecte : on secoue le joueur (visible par TOUTE la salle) mais
    // la bombe continue (style BombParty). La vie n'est perdue qu'au timeout.
    io.to(room.code).emit('game:wrongAttempt', {
      playerId: active.id,
      answer: String(answer || '').slice(0, 40)
    })
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
    mapId: result.iso2 || null, // mode pays : pour la mini-carte
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
  // En imposteur, l'hôte peut forcer le dépouillement pendant un vote d'urgence.
  if (room.config.mode === 'imposteur') {
    if (room.imp && room.imp.phase === 'voting') resolveImpostorVote(room, io)
    return
  }
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
  room.coop.streak += 1
  room.coop.solvedByPlayer[active.id] = (room.coop.solvedByPlayer[active.id] || 0) + 1
  active.coopSolved = room.coop.solvedByPlayer[active.id]
  if (result.normalized) room.usedAnswers.add(result.normalized)

  io.to(room.code).emit('game:answerResult', {
    playerId: active.id,
    correct: true,
    coop: true,
    answer: result.display || answer,
    mapId: result.iso2 || null,
    progress: { solved: room.coop.challengesSolved, needed: room.coop.challengesNeeded }
  })

  // Bonus de série : 10 bonnes réponses d'affilée → on regagne du temps.
  if (room.coop.streak > 0 && room.coop.streak % 10 === 0) {
    const { newTimeRemaining, bonusMs } = coop.applyBonus(room.coop)
    io.to(room.code).emit('coop:bonus', {
      newTimeRemaining,
      bonusMs,
      streak: room.coop.streak
    })
  }

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

  room.coop.streak = 0 // une erreur casse la série
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
  // En imposteur, un départ peut débloquer un tour ou un vote en attente.
  if (room.config.mode === 'imposteur') return handleImpostorLeft(room, leftId, io)
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

// =========================================================================
// Mode Imposteur — coopératif à traître caché (bombe partagée + sabotages)
// =========================================================================

// Bots : probabilité de répondre correctement et délai de « réflexion ».
const IMP_BOT_ANSWER_PROB = 0.82
const IMP_BOT_MIN = 1200
const IMP_BOT_MAX = 4500

// Émet l'état du timer global (réutilise coop:tick côté client pour la bombe).
function emitImpostorTick(room, io) {
  const s = room.imp
  const remaining = impostor.timeLeft(s)
  io.to(room.code).emit('coop:tick', {
    timeRemaining: remaining,
    totalTime: s.totalTime,
    fraction: s.totalTime ? Math.min(1, remaining / s.totalTime) : 0
  })
  return remaining
}

// Émet une variation immédiate du timer (gain vert / perte rouge) pour le flash.
function emitImpostorTimer(room, io, deltaMs) {
  const s = room.imp
  const remaining = impostor.timeLeft(s)
  io.to(room.code).emit('impostor:timer', {
    timeRemaining: remaining,
    totalTime: s.totalTime,
    fraction: s.totalTime ? Math.min(1, remaining / s.totalTime) : 0,
    deltaMs
  })
}

function emitImpostorSuspicion(room, io) {
  io.to(room.code).emit('impostor:suspicionUpdate', { suspicion: room.imp.suspicion })
}

// Démarre le timer global partagé (tic toutes les 100 ms ; explose à 0).
function startImpostorGlobalTimer(room, io) {
  room.coopGlobalTimer = setInterval(() => {
    if (room.state !== 'playing' || !room.imp || room.imp.phase !== 'playing') return
    const remaining = emitImpostorTick(room, io)
    if (remaining <= 0) {
      const end = impostor.checkVictory(room.imp, room.players, 'timer')
      if (end.ended) endImpostor(room, io, { winner: end.winner, reason: 'explosion' })
    }
  }, 100)
}

function startImpostorGame(room, io) {
  clearRoomTimers(room)
  room.state = 'playing'
  room.currentRound = 1
  room.usedAnswers = new Set()
  room.usedChallenges = new Set()
  room.successCount = 0
  room.turnNumber = 0
  for (const p of room.players) { p.eliminated = false }

  room.imp = impostor.initImpostorState(room)
  room.currentTurnIndex = 0

  io.to(room.code).emit('impostor:gameStart', {
    players: publicPlayers(room),
    config: room.config,
    civilCount: impostor.civilCount(room.players.length),
    challengesNeeded: room.imp.challengesNeeded,
    totalTime: room.imp.totalTime,
    suspicion: room.imp.suspicion
  })

  // Rôle privé : seul l'imposteur reçoit sa carte secrète (les autres = Civils).
  io.to(room.imp.impostorId).emit('impostor:role', {
    isImpostor: true,
    sabotagesLeft: room.imp.sabotagesLeft
  })

  emitImpostorTick(room, io)
  startImpostorGlobalTimer(room, io)
  startImpostorTurn(room, io)
}

// Démarre le tour du joueur courant (challenge « combinaison » partagé).
function startImpostorTurn(room, io) {
  clearCoopTurnTimers(room)
  if (room.state !== 'playing' || !room.imp || room.imp.phase !== 'playing') return

  // Saute les joueurs exclus.
  let active = room.players[room.currentTurnIndex]
  if (!active || active.eliminated) {
    const next = getNextPlayerIndex(room.players, room.currentTurnIndex)
    if (next === -1) return
    room.currentTurnIndex = next
    active = room.players[room.currentTurnIndex]
  }

  // Gel de clavier : si ce joueur était ciblé, on l'applique CE tour.
  room.imp.frozenThisTurn = false
  if (room.imp.pendingFreezeTarget === active.id) {
    room.imp.pendingFreezeTarget = null
    room.imp.frozenThisTurn = true
    io.to(room.code).emit('impostor:freezeApplied', {
      targetId: active.id,
      duration: impostor.FREEZE_DURATION_MS
    })
    io.to(active.id).emit('impostor:frozen', { duration: impostor.FREEZE_DURATION_MS })
  }

  // Génère une combinaison (difficulté liée au nombre de réussites).
  const syllable = classic.generateChallenge(room.usedChallenges, WORDS_ARR, room.successCount)
  room.usedChallenges.add(syllable)
  room.currentChallenge = { syllable }
  room.turnNumber += 1
  room.turnStartTime = Date.now()

  io.to(room.code).emit('impostor:turn', {
    playerId: active.id,
    turn: room.turnNumber,
    challenge: { type: 'combo', text: syllable.toUpperCase() },
    timeLimit: impostor.TURN_TIME_MS,
    progress: { solved: room.imp.challengesSolved, needed: room.imp.challengesNeeded }
  })

  room.coopTurnTimer = setTimeout(() => impostorFail(room, io, 'timeout'), impostor.TURN_TIME_MS)
  if (active.isBot) scheduleImpostorBot(room, active, io)
}

// Réponse d'un joueur ou d'un bot.
function handleImpostorAnswer(room, playerId, answer, io) {
  if (!room.imp || room.imp.phase !== 'playing') return
  const active = room.players[room.currentTurnIndex]
  if (!active || active.id !== playerId) return // pas son tour

  // Sabotage armé : la réponse de l'imposteur est forcée incorrecte.
  if (playerId === room.imp.impostorId && room.imp.sabotageArmed) {
    return impostorFail(room, io, 'wrong', true)
  }

  const result = classic.validateAnswer(room.currentChallenge.syllable, answer, room.usedAnswers, WORDS)
  if (!result.valid) return impostorFail(room, io, 'wrong')

  impostorCorrect(room, io, active, result)
}

// Bonne réponse : gain de temps selon la longueur du mot + challenge suivant.
function impostorCorrect(room, io, active, result) {
  clearCoopTurnTimers(room)
  const elapsed = Date.now() - room.turnStartTime
  room.usedAnswers.add(result.normalized)
  room.imp.challengesSolved += 1
  room.successCount += 1

  const wordLength = result.normalized.length
  const gain = impostor.timeGainForWord(wordLength)
  impostor.applyTimerDelta(room.imp, gain)

  impostor.updateSuspicion(room.imp, {
    playerId: active.id,
    correct: true,
    wordLength,
    elapsedMs: elapsed
  })

  io.to(room.code).emit('impostor:answerResult', {
    playerId: active.id,
    correct: true,
    word: result.normalized,
    gainMs: gain,
    progress: { solved: room.imp.challengesSolved, needed: room.imp.challengesNeeded }
  })
  emitImpostorTimer(room, io, gain)
  emitImpostorSuspicion(room, io)

  const end = impostor.checkVictory(room.imp, room.players)
  if (end.ended) return endImpostor(room, io, { winner: end.winner, reason: 'defused' })

  advanceImpostorTurn(room, io, 650)
}

// Échec (mauvaise réponse, sabotage ou timeout) : -12 s.
function impostorFail(room, io, reason, sabotaged = false) {
  if (!room.imp || room.imp.phase !== 'playing') return
  clearCoopTurnTimers(room)
  const active = room.players[room.currentTurnIndex]
  if (!active) return

  // Sabotage (soumission forcée fausse OU timeout après avoir armé).
  const armed = active.id === room.imp.impostorId && room.imp.sabotageArmed
  if (sabotaged || armed) {
    impostor.consumeArmedSabotage(room.imp, room.turnNumber, room.currentChallenge.syllable)
    io.to(room.imp.impostorId).emit('impostor:sabotageResult', { sabotagesLeft: room.imp.sabotagesLeft })
  }

  impostor.applyTimerDelta(room.imp, -impostor.MISS_PENALTY_MS)
  const easy = (room.currentChallenge.syllable || '').length <= 2
  impostor.updateSuspicion(room.imp, {
    playerId: active.id,
    correct: false,
    easyChallenge: easy,
    wasFrozen: room.imp.frozenThisTurn
  })

  io.to(room.code).emit('impostor:answerResult', {
    playerId: active.id,
    correct: false,
    reason,
    lossMs: impostor.MISS_PENALTY_MS,
    progress: { solved: room.imp.challengesSolved, needed: room.imp.challengesNeeded }
  })
  emitImpostorTimer(room, io, -impostor.MISS_PENALTY_MS)
  emitImpostorSuspicion(room, io)

  const end = impostor.checkVictory(room.imp, room.players)
  if (end.ended) return endImpostor(room, io, { winner: end.winner, reason: 'explosion' })

  advanceImpostorTurn(room, io, 850)
}

// Passe au joueur actif suivant (non exclu) après un délai.
function advanceImpostorTurn(room, io, delay) {
  const next = getNextPlayerIndex(room.players, room.currentTurnIndex)
  if (next === -1) return
  room.currentTurnIndex = next
  room.turnTimer = setTimeout(() => startImpostorTurn(room, io), delay)
}

// Coup d'un bot : répond correctement ~82 %, sinon laisse expirer (timeout).
function scheduleImpostorBot(room, bot, io) {
  if (Math.random() >= IMP_BOT_ANSWER_PROB) return
  const syllable = room.currentChallenge.syllable
  const word = WORDS_ARR.find((w) => w.includes(syllable) && !room.usedAnswers.has(w))
  if (!word) return
  const delay = IMP_BOT_MIN + Math.random() * (IMP_BOT_MAX - IMP_BOT_MIN)
  room.botTimer = setTimeout(() => {
    if (room.state !== 'playing' || !room.imp || room.imp.phase !== 'playing') return
    const active = room.players[room.currentTurnIndex]
    if (!active || active.id !== bot.id) return
    handleImpostorAnswer(room, bot.id, word, io)
  }, Math.min(delay, impostor.TURN_TIME_MS - 600))
}

// --- Pouvoirs de l'imposteur ----------------------------------------------

export function handleImpostorSabotage(room, socketId, io) {
  if (!room.imp || room.imp.phase !== 'playing') return
  const active = room.players[room.currentTurnIndex]
  if (!active || active.id !== socketId) return // seulement à son tour
  const res = impostor.handleSabotage(room.imp, socketId)
  if (res.consumed) {
    io.to(socketId).emit('impostor:sabotageResult', { sabotagesLeft: res.sabotagesLeft, armed: true })
  }
}

export function handleImpostorFreeze(room, socketId, targetId, io) {
  if (!room.imp || room.imp.phase !== 'playing') return
  const res = impostor.handleFreeze(room.imp, socketId, targetId, room.players)
  if (res.ok) {
    io.to(socketId).emit('impostor:freezeCooldown', { remainingMs: impostor.FREEZE_COOLDOWN_MS })
  } else if (res.remainingCooldownMs != null) {
    io.to(socketId).emit('impostor:freezeCooldown', { remainingMs: res.remainingCooldownMs })
  }
}

// --- Appel d'urgence + vote ------------------------------------------------

export function handleImpostorEmergency(room, socketId, io) {
  if (!room.imp || room.imp.phase !== 'playing') return
  const caller = room.players.find((p) => p.id === socketId)
  if (!caller || caller.eliminated) return
  if ((room.imp.emergencyCallsLeft[socketId] || 0) <= 0) return

  room.imp.emergencyCallsLeft[socketId] -= 1
  impostor.applyTimerDelta(room.imp, -impostor.EMERGENCY_COST_MS)

  // Gèle le jeu : on stoppe le timer global et le tour courant.
  clearRoomTimers(room)
  room.imp.phase = 'voting'
  room.imp.votingActive = true
  room.imp.votes = {}

  io.to(room.code).emit('impostor:emergencyStarted', {
    callerId: socketId,
    timeLimit: impostor.VOTE_TIME_MS,
    costMs: impostor.EMERGENCY_COST_MS,
    timeRemaining: impostor.timeLeft(room.imp),
    candidates: room.players
      .filter((p) => !p.eliminated)
      .map((p) => ({ id: p.id, username: p.username, color: p.color, isBot: p.isBot }))
  })

  // Bots : votent le joueur le plus suspect (sinon « Personne »).
  const active = room.players.filter((p) => !p.eliminated)
  for (const bot of active.filter((p) => p.isBot)) {
    const others = active.filter((p) => p.id !== bot.id)
    others.sort((a, b) => (room.imp.suspicion[b.id] || 0) - (room.imp.suspicion[a.id] || 0))
    const top = others[0]
    impostor.castVote(room.imp, bot.id, top && (room.imp.suspicion[top.id] || 0) > 0 ? top.id : null)
  }
  io.to(room.code).emit('impostor:voteProgress', impostorVoteProgress(room))

  room.turnTimer = setTimeout(() => resolveImpostorVote(room, io), impostor.VOTE_TIME_MS)
  maybeResolveImpostorVote(room, io)
}

export function handleImpostorVote(room, socketId, targetId, io) {
  if (!room.imp || room.imp.phase !== 'voting') return
  const voter = room.players.find((p) => p.id === socketId)
  if (!voter || voter.eliminated) return
  if (targetId) {
    const target = room.players.find((p) => p.id === targetId)
    if (!target || target.eliminated || targetId === socketId) return
  }
  impostor.castVote(room.imp, socketId, targetId || null)
  io.to(room.code).emit('impostor:voteProgress', impostorVoteProgress(room))
  maybeResolveImpostorVote(room, io)
}

function impostorVoteProgress(room) {
  const active = room.players.filter((p) => !p.eliminated)
  const voted = active.filter((p) => p.id in room.imp.votes).length
  return { voted, total: active.length }
}

function maybeResolveImpostorVote(room, io) {
  const active = room.players.filter((p) => !p.eliminated)
  if (active.every((p) => p.id in room.imp.votes)) resolveImpostorVote(room, io)
}

function resolveImpostorVote(room, io) {
  if (!room.imp || room.imp.phase !== 'voting') return
  clearRoomTimers(room)
  const active = room.players.filter((p) => !p.eliminated)
  const res = impostor.resolveVote(room.imp, active)

  let timerDelta = 0
  if (res.excluded) {
    const ex = room.players.find((p) => p.id === res.excluded)
    if (ex) ex.eliminated = true
    if (!res.wasImpostor) {
      // Un Civil exclu à tort : pénalité de temps.
      impostor.applyTimerDelta(room.imp, -impostor.WRONG_EXCLUSION_PENALTY_MS)
      timerDelta = -impostor.WRONG_EXCLUSION_PENALTY_MS
    }
  } else {
    // Pas de majorité : le plus visé gagne en suspicion.
    impostor.applyNoMajorityPenalty(room.imp, res.topId)
  }

  io.to(room.code).emit('impostor:voteResult', {
    votes: room.imp.votes,
    tally: res.tally,
    excluded: res.excluded || null,
    wasImpostor: res.wasImpostor,
    topId: res.topId || null,
    suspicion: room.imp.suspicion,
    timeRemaining: impostor.timeLeft(room.imp),
    timerDelta
  })
  emitImpostorSuspicion(room, io)

  const end = impostor.checkVictory(room.imp, room.players)
  if (end.ended) {
    const reason = res.wasImpostor ? 'voteImpostor' : 'minority'
    return endImpostor(room, io, { winner: end.winner, reason })
  }

  // Reprise du jeu après un court délai (laisse jouer la révélation du vote).
  room.imp.phase = 'playing'
  room.imp.votingActive = false
  startImpostorGlobalTimer(room, io)
  advanceImpostorTurn(room, io, 1800)
}

// --- Fin de partie ---------------------------------------------------------

function endImpostor(room, io, { winner, reason }) {
  clearRoomTimers(room)
  room.state = 'gameEnd'
  if (room.imp) room.imp.phase = 'end'

  io.to(room.code).emit('impostor:end', {
    winner, // 'civils' | 'impostor' | null
    reason, // 'defused' | 'explosion' | 'voteImpostor' | 'minority' | 'aborted'
    impostorId: room.imp.impostorId,
    sabotageLog: room.imp.sabotageLog,
    sabotagesUsed: impostor.SABOTAGES_PER_GAME - room.imp.sabotagesLeft,
    discretion: impostor.discretionScore(room.imp),
    suspicion: room.imp.suspicion,
    challengesSolved: room.imp.challengesSolved,
    challengesNeeded: room.imp.challengesNeeded,
    players: room.players.map((p) => ({
      id: p.id, username: p.username, color: p.color, isBot: p.isBot, eliminated: p.eliminated
    }))
  })
}

// Départ/déconnexion pendant une partie imposteur.
function handleImpostorLeft(room, leftId, io) {
  if (!room.imp || room.players.length === 0) return

  // L'imposteur quitte → partie interrompue.
  if (leftId === room.imp.impostorId) {
    return endImpostor(room, io, { winner: null, reason: 'aborted' })
  }
  // Trop peu de joueurs pour continuer.
  if (room.players.filter((p) => !p.eliminated).length < 3) {
    return endImpostor(room, io, { winner: null, reason: 'aborted' })
  }

  delete room.imp.votes[leftId]
  room.currentTurnIndex = room.currentTurnIndex % room.players.length

  if (room.imp.phase === 'voting') {
    io.to(room.code).emit('impostor:voteProgress', impostorVoteProgress(room))
    return maybeResolveImpostorVote(room, io)
  }
  if (room.imp.phase === 'playing') {
    startImpostorTurn(room, io)
  }
}

// Point d'entrée pour le vote (compat : appelé depuis server.js).
export function handleVote(room, socket, targetId, io) {
  if (room.config.mode !== 'imposteur') return
  handleImpostorVote(room, socket.id, targetId, io)
}

export { WORDS_ARR, COUNTRIES, CAPITALS }
