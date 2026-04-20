import { io } from 'socket.io-client'
import { SOCKET_BASE_URL } from './api'

export const createSocketConnection = (token) =>
  io(SOCKET_BASE_URL, {
    transports: ['polling', 'websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    auth: {
      token,
    },
  })
