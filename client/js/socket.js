// socket.js — wrapper singleton Socket.IO côté client.
// `io` est fourni globalement par /socket.io/socket.io.js (servi par le serveur,
// proxifié par Vite en dev).

const socket = window.io()
export default socket
