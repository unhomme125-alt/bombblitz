// Mode Capitales — même logique que le mode Pays mais sur capitals.json.
// Le joueur doit taper le nom de la capitale contenant la syllabe affichée.

import { normalize, pick } from '../util.js'

// Même logique que le mode Pays : combos courts (2-3 lettres) consécutifs,
// privilégiant plusieurs correspondances.
export function generateChallenge(usedChallenges, capitals, usedAnswers) {
  const remaining = capitals.filter((c) => !usedAnswers.has(c.norm))
  if (!remaining.length) return null

  const byLen = { 2: new Map(), 3: new Map() }
  for (const c of remaining) {
    for (const s of c.syllables) {
      if ((s.length === 2 || s.length === 3) && !usedChallenges.has(s)) {
        const m = byLen[s.length]
        m.set(s, (m.get(s) || 0) + 1)
      }
    }
  }

  const pickFrom = (map, minMatches) => {
    const arr = [...map.entries()]
      .filter(([, n]) => n >= minMatches)
      .map(([s]) => s)
    return arr.length ? pick(arr) : null
  }

  let syllable =
    pickFrom(byLen[2], 2) ||
    pickFrom(byLen[3], 2) ||
    pickFrom(byLen[2], 1) ||
    pickFrom(byLen[3], 1) ||
    pick(remaining.flatMap((c) => c.syllables))

  const matchingCapitals = remaining
    .filter((c) => c.norm.includes(syllable))
    .map((c) => c.capital)
  return { syllable, matchingCapitals }
}

export function validateAnswer(syllable, answer, usedAnswers, capitals) {
  const a = normalize(answer)
  if (!a) return { valid: false, reason: 'empty', exhausted: false }

  const match = capitals.find((c) => c.norm === a)
  if (!match) return { valid: false, reason: 'notACapital', exhausted: false }
  if (!match.norm.includes(syllable))
    return { valid: false, reason: 'missingCombo', exhausted: false }
  if (usedAnswers.has(a))
    return { valid: false, reason: 'alreadyUsed', exhausted: false }

  const remainingAfter = capitals.filter(
    (c) => c.norm !== a && !usedAnswers.has(c.norm)
  ).length
  return {
    valid: true,
    normalized: a,
    display: match.capital,
    exhausted: remainingAfter === 0
  }
}
