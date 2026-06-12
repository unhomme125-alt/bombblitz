// Mode Classique — taper un mot du dictionnaire contenant la combinaison.
//
// La difficulté augmente avec le nombre de tours réussis : on commence par
// des combinaisons de 2 lettres fréquentes, puis 3 lettres après 10 tours,
// 4 lettres après 25 tours. Chaque combinaison générée est garantie présente
// dans au moins `MIN_MATCHES` mots du dictionnaire (sinon elle serait
// injouable).

import { normalize, pick } from '../util.js'

const MIN_MATCHES = 3

// Construit, une seule fois, un index : combinaison -> nombre de mots la
// contenant, pour des longueurs de 2 à 4 lettres. Permet de générer des
// challenges valides instantanément.
let index = null

function buildIndex(words) {
  const counts = { 2: new Map(), 3: new Map(), 4: new Map() }
  for (const word of words) {
    const w = word // déjà normalisé dans words_fr.json
    for (let len = 2; len <= 4; len++) {
      const seen = new Set()
      for (let i = 0; i + len <= w.length; i++) {
        const sub = w.slice(i, i + len)
        if (seen.has(sub)) continue // ne compte qu'une fois par mot
        seen.add(sub)
        counts[len].set(sub, (counts[len].get(sub) || 0) + 1)
      }
    }
  }
  // Ne garde que les combinaisons suffisamment fréquentes.
  const pools = {}
  for (const len of [2, 3, 4]) {
    pools[len] = [...counts[len].entries()]
      .filter(([, c]) => c >= MIN_MATCHES)
      .map(([sub]) => sub)
  }
  return pools
}

// Détermine la longueur de combinaison selon le nombre de tours réussis.
function difficultyLength(successCount) {
  if (successCount >= 25) return 4
  if (successCount >= 10) return 3
  return 2
}

// Génère une combinaison non encore utilisée dans la manche.
// successCount = nombre de challenges déjà réussis (pour la difficulté).
export function generateChallenge(usedChallenges, words, successCount = 0) {
  if (!index) index = buildIndex(words)

  // Essaie la longueur cible, puis se rabat sur les longueurs plus courtes.
  const target = difficultyLength(successCount)
  for (const len of [target, 3, 2, 4]) {
    const pool = index[len].filter((c) => !usedChallenges.has(c))
    if (pool.length) return pick(pool)
  }
  // Toutes les combinaisons sont épuisées : on régénère depuis le pool complet
  // (la liste « se régénère » comme prévu par les règles).
  usedChallenges.clear()
  return pick(index[target])
}

// Valide qu'un mot contient la combinaison, existe dans le dictionnaire et
// n'a pas déjà été utilisé dans la manche.
export function validateAnswer(challenge, answer, usedAnswers, words) {
  const a = normalize(answer)
  if (!a) return { valid: false, reason: 'empty' }
  if (!a.includes(challenge))
    return { valid: false, reason: 'missingCombo' }
  if (usedAnswers.has(a)) return { valid: false, reason: 'alreadyUsed' }
  // words est un Set côté gameEngine pour une recherche O(1).
  const dict = words instanceof Set ? words : new Set(words)
  if (!dict.has(a)) return { valid: false, reason: 'notInDict' }
  return { valid: true, normalized: a }
}
