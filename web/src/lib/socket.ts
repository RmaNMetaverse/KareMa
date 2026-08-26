import { io, Socket } from 'socket.io-client';
import { getToken } from './api';
import { BASE } from './base';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: `${BASE}/socket.io`,
      auth: { token: getToken() },
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnectionDelay: 800,
      reconnectionDelayMax: 6000,
    });
  }
  return socket;
}

export function refreshSocketAuth() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  return getSocket();
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}
