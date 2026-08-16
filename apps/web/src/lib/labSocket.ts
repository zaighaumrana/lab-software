import { io, Socket } from 'socket.io-client';
import { getSessionId } from '../api/client';

/**
 * Connects to LaboratoryGateway (apps/api/.../laboratory.gateway.ts) so
 * the Laboratory screen can react live to results entered/finalized/
 * reopened by other technicians, instead of polling.
 *
 * Auth mirrors the REST client: the same session token already stored by
 * api/client.ts is sent in the socket handshake, and the server validates
 * it the same way SessionGuard does for HTTP requests. Tenant identity
 * for the broadcast room is derived server-side from that same validated
 * session (see laboratory.gateway.ts) — not sent separately here — so
 * there's exactly one source of truth for it, matching how
 * laboratory.controller.ts now resolves tenantId too.
 *
 * One socket is created per call to connectLabSocket() — call it once
 * per page (e.g. in a useEffect on mount) and disconnect it on unmount.
 * We deliberately don't share a single app-wide singleton: the
 * Laboratory page is the only consumer today, and a page-scoped
 * connection is simpler to reason about (connects only while the page
 * that needs it is open).
 */
export function connectLabSocket(): Socket {
  return io('/ws/laboratory', {
    auth: { sessionId: getSessionId() },
    // Skip the long-polling fallback — on a LAN app there's no need for
    // it, and going straight to a WebSocket avoids an extra round trip.
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });
}
