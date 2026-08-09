import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS_COOKIE } from '@/lib/auth-cookies';

/**
 * The one place the access token intentionally reaches browser JavaScript.
 *
 * Every other backend call in this app runs server-side (Server Components/
 * Actions/Route Handlers) specifically so the token never has to leave the
 * httpOnly cookie — see the note in lib/api.ts. A live WebSocket connection
 * breaks that pattern by necessity: the socket is held open by the browser
 * itself, so the browser needs a token to hand the backend's Socket.IO
 * handshake directly (see RealtimeGateway.handleConnection on the backend,
 * and RealtimeProvider.tsx here).
 *
 * This narrows the exposure as much as the requirement allows: the token
 * only reaches JS via this explicit, same-origin, cookie-gated endpoint —
 * not via a readable `document.cookie` — but it's still real exposure to
 * any script running on this page, XSS included. Worth knowing, not worth
 * hiding. The access token is short-lived (15 min) specifically because
 * exposure windows like this one exist.
 */
export async function GET() {
  const token = cookies().get(ACCESS_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  return NextResponse.json({ token });
}
