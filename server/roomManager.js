// roomManager.js — gestion des salles en mémoire (création, jonction, état).
// Aucune base de données : tout vit dans la Map `rooms`.

import { randInt } from './util.js'

const PLAYER_COLORS = [
  '#ff6b6b', '#ffa94d', '#ffe066', '#69db7c',
  '#4dabf7', '#da77f2', '#f783ac', '#63e6be'
]

const ROOM_TTL_MS = 30 * 60 * 1000 // 30 minutes d'inactivité

// code -> room
const rooms = new Map()
// socketId -> code (index inverse pour retrouver la salle d'un socket)
const socketToRoom = new Map()

function generateCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // sans I/O ambigus
  let code
  do {
    code = Array.from({ length: 4 }, () =>
      letters[randInt(0, letters.length - 1)]
    ).join('')
  } while (rooms.has(code))
  return code
}

// Attribue la première couleur libre de la palette.
function assignColor(players) {
  const taken = new Set(players.map((p) => p.color))
  return PLAYER_COLORS.find((c) => !taken.has(c)) || PLAYER_COLORS[0]
}

function makePlayer(id, username, color, isBot = false) {
  return {
    id,
    username: String(username || 'Joueur').slice(0, 16) || 'Joueur',
    color,
    lives: 0,
    speedPoints: 0,
    roundWins: 0,
    eliminated: false,
    connected: true,
    isBot
  }
}

export function createRoom(hostSocket, username) {
  const code = generateCode()
  const room = {
    code,
    hostId: hostSocket.id,
    players: [makePlayer(hostSocket.id, username, PLAYER_COLORS[0])],
    config: { mode: 'classic', rounds: 3, lives: 3, blitz: false, suddenDeath: false },
    state: 'lobby', // 'lobby' | 'playing' | 'roundEnd' | 'gameEnd'
    currentRound: 0,
    currentTurnIndex: 0,
    currentChallenge: null,
    usedAnswers: new Set(),
    usedChallenges: new Set(),
    successCount: 0,
    turnNumber: 0,
    botCounter: 0,
    turnTimer: null,
    tickTimer: null,
    botTimer: null,
    turnStartTime: 0,
    turnDuration: 0,
    lastActivity: Date.now()
  }
  rooms.set(code, room)
  socketToRoom.set(hostSocket.id, code)
  return room
}

// Renvoie la salle rejointe, ou { error } si impossible.
export function joinRoom(code, socket, username) {
  code = String(code || '').toUpperCase().trim()
  const room = rooms.get(code)
  if (!room) return { error: 'Salle introuvable' }
  if (room.players.length >= PLAYER_COLORS.length)
    return { error: 'Salle pleine' }
  if (room.state !== 'lobby')
    return { error: 'Partie déjà en cours' }

  const player = makePlayer(socket.id, username, assignColor(room.players))
  room.players.push(player)
  socketToRoom.set(socket.id, code)
  room.lastActivity = Date.now()
  return { room }
}

// Retire un joueur. Renvoie { room, wasHost } ou null si introuvable.
export function leaveRoom(socketId) {
  const code = socketToRoom.get(socketId)
  if (!code) return null
  const room = rooms.get(code)
  socketToRoom.delete(socketId)
  if (!room) return null

  const wasHost = room.hostId === socketId
  room.players = room.players.filter((p) => p.id !== socketId)
  room.lastActivity = Date.now()

  if (room.players.length === 0) {
    clearRoomTimers(room)
    rooms.delete(code)
    return { room: null, wasHost, code }
  }

  // Transfert de l'hôte au joueur suivant.
  if (wasHost) room.hostId = room.players[0].id

  return { room, wasHost, code }
}

export function getRoomBySocket(socketId) {
  const code = socketToRoom.get(socketId)
  return code ? rooms.get(code) || null : null
}

export function getRoomByCode(code) {
  return rooms.get(String(code || '').toUpperCase().trim()) || null
}

export function setRoomConfig(code, config) {
  const room = getRoomByCode(code)
  if (!room) return null
  if (config.mode && ['classic', 'countries', 'capitals', 'math'].includes(config.mode))
    room.config.mode = config.mode
  if (Number.isFinite(config.rounds))
    room.config.rounds = Math.min(10, Math.max(1, Math.round(config.rounds)))
  if (Number.isFinite(config.lives))
    room.config.lives = Math.min(5, Math.max(1, Math.round(config.lives)))
  if (typeof config.blitz === 'boolean') room.config.blitz = config.blitz
  if (typeof config.suddenDeath === 'boolean') room.config.suddenDeath = config.suddenDeath
  room.lastActivity = Date.now()
  return room
}

// Ajoute un bot à la salle (en lobby uniquement). Renvoie la salle ou null.
export function addBot(code) {
  const room = getRoomByCode(code)
  if (!room || room.state !== 'lobby') return null
  if (room.players.length >= PLAYER_COLORS.length) return null
  room.botCounter += 1
  const id = `bot_${room.code}_${room.botCounter}`
  const bot = makePlayer(id, `🤖 Bot ${room.botCounter}`, assignColor(room.players), true)
  room.players.push(bot)
  room.lastActivity = Date.now()
  return room
}

// Retire le dernier bot ajouté.
export function removeBot(code) {
  const room = getRoomByCode(code)
  if (!room || room.state !== 'lobby') return null
  const idx = [...room.players].reverse().findIndex((p) => p.isBot)
  if (idx === -1) return room
  const realIdx = room.players.length - 1 - idx
  room.players.splice(realIdx, 1)
  room.lastActivity = Date.now()
  return room
}

export function clearRoomTimers(room) {
  if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null }
  if (room.tickTimer) { clearInterval(room.tickTimer); room.tickTimer = null }
  if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = null }
}

// Vue « publique » d'un joueur (sans champ interne sensible).
export function publicPlayers(room) {
  return room.players.map((p) => ({
    id: p.id,
    username: p.username,
    color: p.color,
    lives: p.lives,
    speedPoints: p.speedPoints,
    roundWins: p.roundWins,
    eliminated: p.eliminated,
    connected: p.connected,
    isBot: p.isBot
  }))
}

// Appelé périodiquement : supprime les salles inactives depuis > TTL.
export function cleanupInactiveRooms() {
  const now = Date.now()
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > ROOM_TTL_MS) {
      clearRoomTimers(room)
      for (const p of room.players) socketToRoom.delete(p.id)
      rooms.delete(code)
      console.log(`🧹 Salle ${code} nettoyée (inactive)`)
    }
  }
}

export function getRoomCount() {
  return rooms.size
}
