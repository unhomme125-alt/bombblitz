// Mode Pays — taper le nom d'un pays contenant la syllabe affichée.
//
// Une syllabe de challenge est garantie présente dans au moins un pays NON
// encore utilisé dans la manche. Quand tous les pays ont été cités,
// validateAnswer renvoie exhausted = true et la manche se termine de façon
// anticipée (calcul des points de rapidité).

import { normalize, pick } from '../util.js'

// Génère une combinaison de lettres CONSÉCUTIVES jouable : une suite de 2-3
// lettres présente dans au moins un pays restant (ex: "al" → allemagne,
// algerie, albanie ; "nc" → france). On privilégie les combos courts avec
// plusieurs correspondances pour un rendu naturel.
// usedAnswers = Set des noms normalisés déjà donnés.
export function generateChallenge(usedChallenges, countries, usedAnswers) {
  const remaining = countries.filter((c) => !usedAnswers.has(c.norm))
  if (!remaining.length) return null // plus aucun pays disponible

  // Compte, pour chaque combo de 2 puis 3 lettres, le nombre de pays restants
  // qui le contiennent.
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

  // Préfère : 2 lettres avec ≥2 pays, puis 3 lettres avec ≥2, puis 2 ou 3
  // lettres avec ≥1, sinon n'importe quelle sous-chaîne d'un pays restant.
  let syllable =
    pickFrom(byLen[2], 2) ||
    pickFrom(byLen[3], 2) ||
    pickFrom(byLen[2], 1) ||
    pickFrom(byLen[3], 1) ||
    pick(remaining.flatMap((c) => c.syllables))

  const matchingCountries = remaining
    .filter((c) => c.norm.includes(syllable))
    .map((c) => c.name)
  return { syllable, matchingCountries }
}

// Valide la réponse. exhausted = true s'il ne reste plus aucun pays après ce
// coup (toute la liste a été utilisée).
export function validateAnswer(syllable, answer, usedAnswers, countries) {
  const a = normalize(answer)
  if (!a) return { valid: false, reason: 'empty', exhausted: false }

  const match = countries.find((c) => c.norm === a)
  if (!match) return { valid: false, reason: 'notACountry', exhausted: false }
  if (!match.norm.includes(syllable))
    return { valid: false, reason: 'missingCombo', exhausted: false }
  if (usedAnswers.has(a))
    return { valid: false, reason: 'alreadyUsed', exhausted: false }

  const remainingAfter = countries.filter(
    (c) => c.norm !== a && !usedAnswers.has(c.norm)
  ).length
  return {
    valid: true,
    normalized: a,
    display: match.name,
    iso2: match.iso2,
    exhausted: remainingAfter === 0
  }
}
