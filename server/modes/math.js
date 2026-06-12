// Mode Calcul — résoudre une opération mathématique.
//
// Difficulté progressive selon le numéro de tour :
//   Tours 1-5   : addition / soustraction, nombres 1-20
//   Tours 6-15  : multiplication, nombres 1-12
//   Tours 16-30 : division entière (résultats entiers) ou puissances (2^n, n<=5)
//   Tours 31+   : combinaisons multi-opérations avec parenthèses, nombres <=100
//
// Pas de dictionnaire : la validation est un simple comparatif numérique.

import { randInt, pick } from '../util.js'

export function generateChallenge(turnNumber) {
  if (turnNumber <= 5) {
    // Addition / soustraction, résultat positif garanti.
    const a = randInt(1, 20)
    const b = randInt(1, 20)
    if (Math.random() < 0.5) {
      return { expression: `${a} + ${b}`, answer: a + b }
    }
    const [hi, lo] = a >= b ? [a, b] : [b, a]
    return { expression: `${hi} − ${lo}`, answer: hi - lo }
  }

  if (turnNumber <= 15) {
    // Multiplication.
    const a = randInt(2, 12)
    const b = randInt(2, 12)
    return { expression: `${a} × ${b}`, answer: a * b }
  }

  if (turnNumber <= 30) {
    // Division entière ou puissance de 2.
    if (Math.random() < 0.5) {
      const b = randInt(2, 12)
      const result = randInt(2, 12)
      const a = b * result // garantit un résultat entier
      return { expression: `${a} ÷ ${b}`, answer: result }
    }
    const n = randInt(2, 5)
    return { expression: `2^${n}`, answer: 2 ** n }
  }

  // Tours 31+ : combinaison multi-opérations avec parenthèses.
  const a = randInt(2, 20)
  const b = randInt(2, 20)
  const c = randInt(2, 10)
  const op = pick(['+', '−', '×'])
  if (op === '+') {
    return { expression: `(${a} + ${b}) × ${c}`, answer: (a + b) * c }
  }
  if (op === '−') {
    const [hi, lo] = a >= b ? [a, b] : [b, a]
    return { expression: `(${hi} − ${lo}) × ${c}`, answer: (hi - lo) * c }
  }
  return { expression: `${a} × ${b} + ${c}`, answer: a * b + c }
}

// La réponse attendue est stockée dans le challenge ; on compare l'entier saisi.
export function validateAnswer(challenge, userAnswer) {
  const n = parseInt(String(userAnswer).trim(), 10)
  if (Number.isNaN(n)) return { valid: false, reason: 'notANumber' }
  return { valid: n === challenge.answer }
}
