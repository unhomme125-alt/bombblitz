// Utilitaires partagés côté serveur.

// Normalise une chaîne pour la comparaison : sans accents, en minuscules,
// uniquement les lettres a-z (les espaces, tirets, apostrophes sont retirés).
// Utilisé pour comparer la saisie du joueur aux réponses attendues.
export function normalize(str) {
  return String(str)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
}

// Choisit un élément aléatoire dans un tableau.
export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

// Entier aléatoire dans [min, max] inclus.
export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
