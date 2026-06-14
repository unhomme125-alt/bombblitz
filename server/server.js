// server.js — point d'entrée Express + Socket.IO.

import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'

import * as rooms from './roomManager.js'
import * as engine from './gameEngine.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PORT = process.env.PORT || 3000

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: '*' } })

// Sert le build statique si présent (dist/), sinon les sources (client/) en dev.
const staticDir = existsSync(join(ROOT, 'dist'))
  ? join(ROOT, 'dist')
  : join(ROOT, 'client')
app.use(express.static(staticDir))

// Envoie l'état lobby à tous les membres d'une salle.
function broadcastPlayers(room) {
  io.to(room.code).emit('room:playerUpdate', {
    players: rooms.publicPlayers(room),
    hostId: room.hostId,
    config: room.config
  })
}

io.on('connection', (socket) => {
  // --- Création d'une salle -------------------------------------------------
  socket.on('room:create', ({ username }) => {
    const room = rooms.createRoom(socket, username)
    socket.join(room.code)
    socket.emit('room:joined', {
      code: room.code,
      players: rooms.publicPlayers(room),
      isHost: true,
      hostId: room.hostId,
      config: room.config
    })
  })

  // --- Rejoindre une salle --------------------------------------------------
  socket.on('room:join', ({ code, username }) => {
    const res = rooms.joinRoom(code, socket, username)
    if (res.error) {
      socket.emit('room:error', { message: res.error })
      return
    }
    const room = res.room
    socket.join(room.code)
    socket.emit('room:joined', {
      code: room.code,
      players: rooms.publicPlayers(room),
      isHost: room.hostId === socket.id,
      hostId: room.hostId,
      config: room.config
    })
    broadcastPlayers(room)
  })

  // --- Quitter --------------------------------------------------------------
  socket.on('room:leave', () => handleLeave(socket))

  // --- Configuration du lobby (hôte uniquement) -----------------------------
  socket.on('lobby:setMode', ({ mode }) => {
    const room = rooms.getRoomBySocket(socket.id)
    if (!room || room.hostId !== socket.id || room.state !== 'lobby') return
    rooms.setRoomConfig(room.code, { mode })
    broadcastPlayers(room)
  })

  socket.on('lobby:setConfig', (cfg) => {
    const room = rooms.getRoomBySocket(socket.id)
    if (!room || room.hostId !== socket.id || room.state !== 'lobby') return
    rooms.setRoomConfig(room.code, cfg || {})
    broadcastPlayers(room)
  })

  // --- Bots (hôte uniquement, en lobby) -------------------------------------
  socket.on('lobby:addBot', () => {
    const room = rooms.getRoomBySocket(socket.id)
    if (!room || room.hostId !== socket.id) return
    if (rooms.addBot(room.code)) broadcastPlayers(room)
  })

  socket.on('lobby:removeBot', () => {
    const room = rooms.getRoomBySocket(socket.id)
    if (!room || room.hostId !== socket.id) return
    if (rooms.removeBot(room.code)) broadcastPlayers(room)
  })

  // --- Lancement de la partie (hôte uniquement) -----------------------------
  socket.on('game:start', () => {
    const room = rooms.getRoomBySocket(socket.id)
    if (!room || room.hostId !== socket.id) return
    if (room.state !== 'lobby' && room.state !== 'gameEnd') return
    if (room.players.length < 1) return
    // Le mode imposteur exige au moins 4 participants (humains + bots).
    if (room.config.mode === 'imposteur' && room.players.length < 4) {
      socket.emit('game:notice', { message: 'Le mode Imposteur nécessite au moins 4 joueurs (ajoute des bots).' })
      return
    }
    engine.startGame(room, io)
  })

  // --- Mode Imposteur : pouvoirs, appel d'urgence et vote -------------------
  socket.on('impostor:sabotage', () => {
    const room = rooms.getRoomBySocket(socket.id)
    if (room) engine.handleImpostorSabotage(room, socket.id, io)
  })

  socket.on('impostor:freeze', ({ targetId }) => {
    const room = rooms.getRoomBySocket(socket.id)
    if (room) engine.handleImpostorFreeze(room, socket.id, targetId, io)
  })

  socket.on('impostor:emergencyCall', () => {
    const room = rooms.getRoomBySocket(socket.id)
    if (room) engine.handleImpostorEmergency(room, socket.id, io)
  })

  socket.on('impostor:vote', ({ targetId }) => {
    const room = rooms.getRoomBySocket(socket.id)
    if (room) engine.handleImpostorVote(room, socket.id, targetId, io)
  })

  // --- Réponse d'un joueur --------------------------------------------------
  socket.on('game:answer', ({ answer }) => {
    const room = rooms.getRoomBySocket(socket.id)
    if (!room) return
    engine.handleAnswer(room, socket, answer, io)
  })

  // --- Saisie en temps réel (broadcast aux autres) --------------------------
  socket.on('game:typing', ({ text }) => {
    const room = rooms.getRoomBySocket(socket.id)
    if (!room || room.state !== 'playing') return
    const active = room.players[room.currentTurnIndex]
    if (!active || active.id !== socket.id) return
    socket.to(room.code).emit('game:typing', {
      playerId: socket.id,
      text: String(text || '').slice(0, 40)
    })
  })

  // --- Prêt pour la manche suivante (l'hôte peut forcer) --------------------
  socket.on('game:ready', () => {
    const room = rooms.getRoomBySocket(socket.id)
    if (!room || room.hostId !== socket.id) return
    engine.advanceNow(room, io)
  })

  // --- Déconnexion ----------------------------------------------------------
  socket.on('disconnect', () => handleLeave(socket))

  function handleLeave(sock) {
    const before = rooms.getRoomBySocket(sock.id)
    const wasPlaying = before && before.state === 'playing'
    const res = rooms.leaveRoom(sock.id)
    sock.leave(before?.code)
    if (!res || !res.room) return // salle vidée et supprimée

    const room = res.room
    broadcastPlayers(room)
    if (res.wasHost) {
      io.to(room.code).emit('room:hostChanged', { hostId: room.hostId })
    }
    if (wasPlaying) {
      engine.handlePlayerLeftDuringGame(room, sock.id, io)
    }
  }
})

// Nettoyage périodique des salles inactives (TTL 30 min).
setInterval(rooms.cleanupInactiveRooms, 5 * 60 * 1000)

httpServer.listen(PORT, () => {
  console.log(`💣 BombBlitz serveur sur http://localhost:${PORT}`)
  console.log(`   Données : ${engine.WORDS_ARR.length} mots, ${engine.COUNTRIES.length} pays, ${engine.CAPITALS.length} capitales`)
})
