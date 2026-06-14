// Mode Imposteur — coopératif à traître caché.
//
// Toute l'équipe partage UNE bombe à timer global et répond à tour de rôle à
// des challenges « combinaison » (comme le mode Classique). Chaque bonne
// réponse rallonge le timer (selon la longueur du mot), chaque erreur/timeout
// le raccourcit de 12 s. Un joueur est secrètement l'Imposteur : il joue
// normalement mais peut SABOTER (3 charges), FREEZER le clavier d'un autre
// (1×/min) et veut faire exploser la bombe sans se faire repérer.
//
// L'équipe peut déclencher un APPEL D'URGENCE (coûte 8 s) pour voter et exclure
// un suspect. Une jauge de SUSPICION passive (0-5 👁️) se met à jour
// automatiquement à chaque tour. La partie se révèle à la fin (rôle + sabotages
// + score de discrétion de l'imposteur).
//
// Ce module ne contient que la logique « pure » (état, deltas de timer,
// suspicion, votes, victoire, discrétion). L'orchestration des tours, des
// timers et des émissions Socket.IO vit dans gameEngine.js.

import { randInt } from '../util.js'

// --- Constantes d'équilibre ------------------------------------------------
export const SABOTAGES_PER_GAME = 3
export const MISS_PENALTY_MS = 12000 // -12 s sur erreur ou timeout
export const EMERGENCY_COST_MS = 8000 // -8 s à l'activation d'un appel
export const WRONG_EXCLUSION_PENALTY_MS = 20000 // -20 s si un Civil est exclu
export const MIN_TIME_MS = 5000 // le timer ne descend jamais sous 5 s (pénalités)
export const FREEZE_DURATION_MS = 4000 // durée du gel de clavier
export const FREEZE_COOLDOWN_MS = 60000 // 1 freeze par minute
export const VOTE_TIME_MS = 15000 // durée d'un vote d'urgence
export const MAX_SUSPICION = 5
export const TURN_TIME_MS = 8000 // temps de réponse par tour

// Gain de temps selon la longueur du mot correct (ms).
export function timeGainForWord(length) {
  if (length >= 8) return 15000
  if (length === 7) return 11000
  if (length === 6) return 8000
  if (length === 5) return 5000
  return 3000 // 4 lettres (et moins, par sécurité)
}

// Nombre de challenges à compléter pour désamorcer = joueurs × 4, minimum 12.
export function challengesToDefuse(playerCount) {
  return Math.max(12, playerCount * 4)
}

// Nombre de Civils affiché dans le lobby (il y a toujours exactement 1
// Imposteur, quelle que soit la taille de la salle).
export function civilCount(playerCount) {
  return Math.max(1, playerCount - 1)
}

// Désigne l'imposteur au hasard. On privilégie un joueur humain s'il en existe
// (le sabotage n'a de sens que joué par une vraie personne) ; sinon n'importe
// quel joueur.
export function assignImpostor(players) {
  const humans = players.filter((p) => !p.isBot)
  const pool = humans.length ? humans : players
  return pool[randInt(0, pool.length - 1)].id
}

// Initialise l'état du mode pour une nouvelle partie.
export function initImpostorState(room) {
  const impostorId = assignImpostor(room.players)
  const totalTime = room.config.impostorTime || 60000
  const penaltyMs = room.config.impostorPenalty || MISS_PENALTY_MS
  const gainMult = room.config.impostorGain || 1
  const suspicion = {}
  const emergencyCallsLeft = {}
  const missStreak = {}
  for (const p of room.players) {
    suspicion[p.id] = 0
    emergencyCallsLeft[p.id] = 1
    missStreak[p.id] = 0
  }
  return {
    impostorId,
    sabotagesLeft: SABOTAGES_PER_GAME,
    sabotageArmed: false, // l'imposteur a armé un sabotage pour sa soumission
    sabotageLog: [], // [{ turn, syllable }]
    freezeCooldownUntil: 0, // timestamp ; freeze possible si Date.now() >= ce point
    pendingFreezeTarget: null, // id du joueur à geler à son prochain tour
    frozenThisTurn: false, // le joueur actif est-il gelé ce tour ?
    suspicion, // id -> 0..MAX_SUSPICION
    emergencyCallsLeft, // id -> 0 | 1
    missStreak, // id -> nombre d'échecs consécutifs
    votes: {}, // voterId -> targetId
    votingActive: false,
    phase: 'playing', // 'playing' | 'voting' | 'end'
    callsAgainstImpostor: 0, // votes d'urgence où l'imposteur a été le plus visé
    totalTime,
    penaltyMs, // temps perdu par erreur (configurable)
    gainMult, // multiplicateur du temps gagné (configurable)
    deadline: Date.now() + totalTime,
    challengesSolved: 0,
    challengesNeeded: challengesToDefuse(room.players.length),
    turnStartTime: 0
  }
}

// --- Timer global ----------------------------------------------------------

// Temps restant courant (ms), jamais négatif.
export function timeLeft(state) {
  return Math.max(0, state.deadline - Date.now())
}

// Applique un delta de temps (ms, positif = gain, négatif = perte). Le timer
// PEUT dépasser sa valeur de départ (les bonnes réponses l'allongent) ; une
// perte ne fait jamais descendre sous 5 s. Renvoie le nouveau temps restant.
export function applyTimerDelta(state, deltaMs) {
  const remaining = timeLeft(state)
  let next = remaining + deltaMs
  if (deltaMs < 0) next = Math.max(MIN_TIME_MS, next)
  state.deadline = Date.now() + next
  return next
}

// --- Sabotage --------------------------------------------------------------

// L'imposteur arme un sabotage avant de soumettre. Consomme une charge
// immédiatement. Renvoie { consumed, sabotagesLeft }.
export function handleSabotage(state, playerId) {
  if (playerId !== state.impostorId) return { consumed: false, sabotagesLeft: state.sabotagesLeft }
  if (state.sabotageArmed) return { consumed: false, sabotagesLeft: state.sabotagesLeft } // déjà armé
  if (state.sabotagesLeft <= 0) return { consumed: false, sabotagesLeft: 0 }
  state.sabotageArmed = true
  state.sabotagesLeft -= 1
  return { consumed: true, sabotagesLeft: state.sabotagesLeft }
}

// Consomme (désarme) le sabotage en fin de tour. Renvoie true s'il était armé.
export function consumeArmedSabotage(state, turn, syllable) {
  if (!state.sabotageArmed) return false
  state.sabotageArmed = false
  state.sabotageLog.push({ turn, syllable })
  return true
}

// --- Freeze ----------------------------------------------------------------

// L'imposteur tente de geler le clavier d'un joueur. Échoue si hors cooldown,
// cible invalide ou cible = imposteur. Renvoie { ok, remainingCooldownMs }.
export function handleFreeze(state, impostorId, targetId, players, now = Date.now()) {
  if (impostorId !== state.impostorId) return { ok: false }
  if (now < state.freezeCooldownUntil) {
    return { ok: false, remainingCooldownMs: state.freezeCooldownUntil - now }
  }
  const target = players.find((p) => p.id === targetId)
  if (!target || target.eliminated || targetId === impostorId) return { ok: false }
  state.pendingFreezeTarget = targetId
  state.freezeCooldownUntil = now + FREEZE_COOLDOWN_MS
  return { ok: true }
}

// Temps restant de cooldown du freeze (ms), 0 si prêt.
export function freezeCooldownRemaining(state, now = Date.now()) {
  return Math.max(0, state.freezeCooldownUntil - now)
}

// --- Suspicion -------------------------------------------------------------

function bumpSuspicion(state, playerId, delta) {
  const cur = state.suspicion[playerId] || 0
  state.suspicion[playerId] = Math.max(0, Math.min(MAX_SUSPICION, cur + delta))
}

// Met à jour la jauge de suspicion après un tour.
//  event = {
//    playerId, correct, wordLength, elapsedMs,
//    easyChallenge (mot court/commun), wasFrozen
//  }
export function updateSuspicion(state, event) {
  const { playerId, correct, wordLength = 0, elapsedMs = 9999, easyChallenge = false, wasFrozen = false } = event

  if (correct) {
    state.missStreak[playerId] = 0
    if (wordLength >= 8) bumpSuspicion(state, playerId, -1) // mot long et correct
    if (elapsedMs < 800) bumpSuspicion(state, playerId, +1) // trop rapide pour être honnête
  } else {
    // Échec (mauvaise réponse ou timeout).
    if (wasFrozen) {
      // Victime innocentée : pas de soupçon supplémentaire, on l'allège même.
      bumpSuspicion(state, playerId, -1)
      state.missStreak[playerId] = 0
      return
    }
    state.missStreak[playerId] = (state.missStreak[playerId] || 0) + 1
    if (state.missStreak[playerId] >= 2) {
      bumpSuspicion(state, playerId, +1) // deux tours ratés de suite
      state.missStreak[playerId] = 0
    }
    if (easyChallenge) bumpSuspicion(state, playerId, +1) // raté sur un mot facile
  }
}

// --- Vote d'urgence --------------------------------------------------------

// Enregistre un vote (targetId peut être null pour « Personne / Annuler »).
export function castVote(state, voterId, targetId) {
  state.votes[voterId] = targetId || null
}

// Dépouille le vote. activePlayers = joueurs non exclus.
// Renvoie { excluded, wasImpostor, topId, tally, majority }.
//  - excluded : id exclu si majorité absolue, sinon null
//  - topId : joueur le plus visé (pour la pénalité de suspicion en cas de
//    non-majorité)
export function resolveVote(state, activePlayers) {
  const tally = {}
  for (const target of Object.values(state.votes)) {
    if (!target) continue
    tally[target] = (tally[target] || 0) + 1
  }
  let topId = null
  let best = 0
  let tie = false
  for (const [id, n] of Object.entries(tally)) {
    if (n > best) { best = n; topId = id; tie = false }
    else if (n === best) tie = true
  }
  const majorityThreshold = Math.floor(activePlayers.length / 2) + 1
  const majority = !tie && best >= majorityThreshold
  const excluded = majority ? topId : null
  const wasImpostor = excluded === state.impostorId

  if (excluded === state.impostorId || topId === state.impostorId) {
    // L'imposteur a été le plus visé ce vote (exclu ou non) → impacte sa
    // discrétion finale.
    state.callsAgainstImpostor += 1
  }
  return { excluded, wasImpostor, topId: tie ? null : topId, tally, majority }
}

// Applique la pénalité de suspicion au joueur le plus visé quand il n'y a pas
// eu de majorité (+2 👁️).
export function applyNoMajorityPenalty(state, topId) {
  if (topId) bumpSuspicion(state, topId, +2)
}

// --- Victoire --------------------------------------------------------------

// Vérifie l'état de victoire. Renvoie { ended, winner } où winner vaut
// 'civils' | 'impostor' | null.
//  trigger (optionnel) : 'timer' force la défaite (bombe explosée).
export function checkVictory(state, players, trigger = null) {
  const active = players.filter((p) => !p.eliminated)

  // Imposteur déjà exclu → Civils gagnent.
  const impostor = players.find((p) => p.id === state.impostorId)
  if (impostor && impostor.eliminated) {
    return { ended: true, winner: 'civils' }
  }
  // Bombe désamorcée.
  if (state.challengesSolved >= state.challengesNeeded) {
    return { ended: true, winner: 'civils' }
  }
  // Bombe explosée.
  if (trigger === 'timer' || timeLeft(state) <= 0) {
    return { ended: true, winner: 'impostor' }
  }
  // Minorité : il ne reste que 2 joueurs (dont l'imposteur) → il bloque.
  if (active.length <= 2) {
    return { ended: true, winner: 'impostor' }
  }
  return { ended: false, winner: null }
}

// --- Discrétion ------------------------------------------------------------

// Score de discrétion final de l'imposteur (0-100).
// Discrétion = 100 - (👁️ imposteur × 15) - (appels reçus × 20).
export function discretionScore(state) {
  const susp = state.suspicion[state.impostorId] || 0
  const raw = 100 - susp * 15 - state.callsAgainstImpostor * 20
  return Math.max(0, Math.min(100, Math.round(raw)))
}
