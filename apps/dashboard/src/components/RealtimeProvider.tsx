'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

interface RealtimeContextValue {
  socket: Socket | null;
  status: ConnectionStatus;
}

const RealtimeContext = createContext<RealtimeContextValue>({ socket: null, status: 'connecting' });

/**
 * Fetches a fresh token from /api/realtime-token and opens one Socket.IO
 * connection for the whole dashboard, shared via context — pages don't each
 * open their own connection, they just subscribe to events on this one via
 * useRealtimeEvent(). See app/api/realtime-token/route.ts for why the token
 * fetch happens here specifically (this is the one place it needs to).
 *
 * Known simplification: a socket that's been open longer than the 15-minute
 * access token TTL doesn't proactively re-authenticate — the initial
 * handshake is what's checked (see backend RealtimeGateway.handleConnection),
 * and Socket.IO doesn't re-run it for an already-open connection. In
 * practice a dashboard tab left open picks up a fresh token on its next
 * reconnect (network blip, laptop sleep, etc.), which is normal enough for
 * an MVP internal tool — flagged here rather than solved, since solving it
 * properly means the client watching its own token expiry and proactively
 * cycling the socket, more machinery than this stage needs.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_BACKEND_WS_URL ?? 'http://localhost:3000';
    let cancelled = false;
    let activeSocket: Socket | null = null;

    async function connect() {
      try {
        const res = await fetch('/api/realtime-token');
        if (!res.ok || cancelled) return;
        const { token } = await res.json();

        activeSocket = io(wsUrl, { auth: { token } });
        activeSocket.on('connect', () => !cancelled && setStatus('connected'));
        activeSocket.on('disconnect', () => !cancelled && setStatus('disconnected'));
        activeSocket.on('connect_error', () => !cancelled && setStatus('disconnected'));

        if (!cancelled) setSocket(activeSocket);
      } catch {
        if (!cancelled) setStatus('disconnected');
      }
    }
    connect();

    return () => {
      cancelled = true;
      activeSocket?.disconnect();
    };
  }, []);

  return <RealtimeContext.Provider value={{ socket, status }}>{children}</RealtimeContext.Provider>;
}

/** Subscribes to one Socket.IO event for the lifetime of the calling component. */
export function useRealtimeEvent<T = unknown>(eventName: string, handler: (payload: T) => void): void {
  const { socket } = useContext(RealtimeContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket) return;
    const listener = (payload: T) => handlerRef.current(payload);
    socket.on(eventName, listener);
    return () => {
      socket.off(eventName, listener);
    };
  }, [socket, eventName]);
}

export function useRealtimeConnectionStatus(): ConnectionStatus {
  return useContext(RealtimeContext).status;
}
