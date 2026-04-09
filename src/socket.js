import { io } from 'socket.io-client'
import { SOCKET_BASE_URL } from './api'

export const createSocketConnection = (token) =>
  io(SOCKET_BASE_URL, {
    transports: ['websocket', 'polling'],
    autoConnect: true,
    auth: {
      token,
    },
  })
