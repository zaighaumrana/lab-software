import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';

/**
 * Pushes lab-result change events to connected staff clients so the
 * Laboratory screen updates live (a value entered/finalized/reopened by
 * one technician shows up for everyone else) instead of relying on
 * polling.
 *
 * Auth: reuses the same session-token scheme as the REST API (see
 * SessionGuard) rather than a separate mechanism — the client sends its
 * existing sessionId in the socket handshake (`auth.sessionId`), we
 * validate it the same way AuthService already does for HTTP requests.
 *
 * Tenant room: deliberately NOT taken from the validated session.
 * Every REST mutation in this app resolves tenantId from a header
 * (`x-tenant-id`, see laboratory.controller.ts's resolveTenantId()) —
 * this deployment's single-tenant testing convention — not from the
 * caller's session. If the gateway joined sockets to a room keyed by
 * session.tenantId instead, sockets would sit in a different room than
 * notifySampleChanged() ever broadcasts to, and nothing would ever
 * arrive — silently, with no error anywhere. (This happened once
 * already.) So the room key here mirrors the REST resolution exactly:
 * read from the handshake, same default fallback, same value REST uses.
 *
 * This app is single-server by design (see AuthService's in-memory
 * session store) so the default in-memory socket.io adapter is
 * sufficient. If this ever needs to run as multiple API instances behind
 * a load balancer, swap in the Redis adapter (@socket.io/redis-adapter)
 * in main.ts — the gateway code below doesn't need to change.
 */
@WebSocketGateway({
  namespace: '/ws/laboratory',
  cors: { origin: true, credentials: true },
})
export class LaboratoryGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(LaboratoryGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly authService: AuthService) {}

  handleConnection(client: Socket) {
    const sessionId =
      (client.handshake.auth?.sessionId as string | undefined) ??
      (client.handshake.query?.sessionId as string | undefined);

    const session = this.authService.validateSession(sessionId);
    if (!session) {
      this.logger.warn(`Rejected socket connection ${client.id}: invalid or missing session`);
      client.disconnect(true);
      return;
    }

    // Matches laboratory.controller.ts's resolveTenantId() exactly —
    // header/auth value first, same env fallback, same literal default.
    // See the class-level comment above for why this can't be
    // session.tenantId.
    const tenantId =
      (client.handshake.auth?.tenantId as string | undefined) ||
      process.env.DEFAULT_TENANT_ID ||
      'default-tenant';

    client.data.tenantId = tenantId;
    client.data.userId = session.userId;
    client.join(`tenant:${tenantId}`);
  }

  handleDisconnect(client: Socket) {
    // socket.io removes room membership automatically on disconnect —
    // nothing to clean up here. Kept as a documented no-op so intent is
    // clear if logging/metrics are added later.
    void client;
  }

  /**
   * Called by LaboratoryService right after a result is entered,
   * finalized, or reopened. Broadcasts to every connected client for the
   * tenant (including the technician who made the change — re-applying
   * your own update is harmless and keeps this simple).
   */
  notifySampleChanged(tenantId: string, sampleId: string) {
    this.server.to(`tenant:${tenantId}`).emit('sample:changed', { sampleId });
  }
}
