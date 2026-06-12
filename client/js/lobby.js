// lobby.js — logique de la page d'accueil (index.html).
//
// On NE se connecte PAS en Socket.IO ici : on stocke simplement l'intention
// (créer / rejoindre + pseudo) dans sessionStorage puis on redirige vers
// game.html, qui établit la connexion. Cela évite qu'une déconnexion liée à
// la navigation ne retire le joueur de la salle.

const usernameInput = document.getElementById('username')
const joinCodeInput = document.getElementById('joinCode')
const createBtn = document.getElementById('createBtn')
const joinBtn = document.getElementById('joinBtn')
const errorEl = document.getElementById('error')

// Restaure le dernier pseudo utilisé.
usernameInput.value = localStorage.getItem('bb:username') || ''

function getUsername() {
  const name = usernameInput.value.trim()
  if (!name) {
    errorEl.textContent = 'Entre un pseudo pour jouer.'
    usernameInput.focus()
    return null
  }
  localStorage.setItem('bb:username', name)
  return name
}

function go(intent) {
  sessionStorage.setItem('bb:intent', JSON.stringify(intent))
  const url =
    intent.action === 'join'
      ? `game.html?room=${encodeURIComponent(intent.code)}`
      : 'game.html'
  window.location.href = url
}

createBtn.addEventListener('click', () => {
  const username = getUsername()
  if (!username) return
  go({ action: 'create', username })
})

joinBtn.addEventListener('click', () => {
  const username = getUsername()
  if (!username) return
  const code = joinCodeInput.value.trim().toUpperCase()
  if (code.length !== 4) {
    errorEl.textContent = 'Le code fait 4 lettres.'
    joinCodeInput.focus()
    return
  }
  go({ action: 'join', code, username })
})

// Raccourcis clavier.
joinCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinBtn.click()
})
usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createBtn.click()
})
joinCodeInput.addEventListener('input', () => {
  joinCodeInput.value = joinCodeInput.value.toUpperCase().replace(/[^A-Z]/g, '')
})
