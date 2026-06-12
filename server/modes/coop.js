// Mode Coopératif — toute l'équipe désamorce UNE bombe partagée avant que son
// timer global n'atteigne zéro. Pas d'élimination ni de tour compétitif : les
// challenges (du sous-mode choisi) sont assignés à tour de rôle, et chaque
// erreur (mauvaise réponse ou timeout individuel de 5s) retire 10 % du temps
// restant.
//
// Ce module ne contient que la logique d'état coopérative (timer, pénalité,
// fin). La génération/validation des challenges et l'orchestration des tours
// vivent dans gameEngine.js (qui réutilise les modes classic/countries/...).

// Initialise l'état coopératif d'une salle pour une nouvelle manche.
export function initCoopRound(room) {
  const totalTime = room.config.coopTime // ms
  const coopState = {
    totalTime,
    deadline: Date.now() + totalTime, // instant d'explosion ; le temps restant
                                      // en dérive (les pénalités l'avancent)
    challengesSolved: 0,
    challengesNeeded: Math.max(10, room.players.length * 5),
    currentChallenge: null,
    subMode: room.config.coopSubMode,
    turnNumber: 0,
    solvedByPlayer: {}, // id -> nombre de challenges résolus
    turnTimer: null,
    globalTimer: null
  }
  for (const p of room.players) {
    coopState.solvedByPlayer[p.id] = 0
    p.coopSolved = 0
  }
  return coopState
}

// Temps restant courant (ms), jamais négatif.
export function timeLeft(coopState) {
  return Math.max(0, coopState.deadline - Date.now())
}

// Émet l'état du timer global à toute la salle (appelé toutes les 100 ms).
// Renvoie le temps restant pour que l'appelant détecte la défaite.
export function tickGlobalTimer(room, io) {
  const remaining = timeLeft(room.coop)
  io.to(room.code).emit('coop:tick', {
    timeRemaining: remaining,
    totalTime: room.coop.totalTime,
    fraction: room.coop.totalTime ? remaining / room.coop.totalTime : 0
  })
  return remaining
}

// Applique une pénalité : retire 10 % du temps restant (avance la deadline).
export function applyPenalty(coopState) {
  const remaining = timeLeft(coopState)
  const penaltyMs = Math.round(remaining * 0.1)
  coopState.deadline -= penaltyMs
  return { newTimeRemaining: Math.max(0, remaining - penaltyMs), penaltyMs }
}

// Détermine si la manche coopérative est terminée (victoire ou défaite).
export function checkCoopEnd(coopState) {
  if (coopState.challengesSolved >= coopState.challengesNeeded) {
    return { ended: true, victory: true }
  }
  if (timeLeft(coopState) <= 0) {
    return { ended: true, victory: false }
  }
  return { ended: false, victory: false }
}
