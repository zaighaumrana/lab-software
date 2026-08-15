import { io, Socket } from 'socket.io-client';
import { getSessionId, getTenantId } from '../api/client';

/**
 * Connects to LaboratoryGateway (apps/api/.../laboratory.gateway.ts) so
 * the Laboratory screen can react live to results entered/finalized/
 * reopened by other technicians, instead of polling.
 *
 * Auth mirrors the REST client: the same session token already stored by
 * api/client.ts is sent in the socket handshake, and the server validates
 * it the same way the SessionGuard does for HTTP requests.
 *
 * tenantId is sent explicitly too, and must match what REST calls send
 * (api/client.ts's x-tenant-id header) exactly — the gateway uses it to
 * decide which broadcast room this socket joins, and every REST mutation
 * broadcasts using that same tenant value. If the two ever resolve
 * tenant identity differently again, sockets silently sit in an empty
 * room and nothing ever arrives, with no visible error anywhere — this
 * bit the app once already, hence getTenantId() being the one shared
 * source of truth for both channels now.
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
    auth: { sessionId: getSessionId(), tenantId: getTenantId() },
    // Skip the long-polling fallback — on a LAN app there's no need for
    // it, and going straight to a WebSocket avoids an extra round trip.
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });
}
