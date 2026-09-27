import { io, type Socket } from 'socket.io-client';

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

// One socket for the whole app. The server decides which rooms we belong to,
// from the token given at handshake — the client never asks to join anything.
export function connectSocket(token: string): Socket {
  return io(`${BASE}/realtime`, {
    auth: { token },
    transports: ['websocket'],
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
}

export type { Socket };
