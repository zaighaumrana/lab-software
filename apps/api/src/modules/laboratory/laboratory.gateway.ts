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
 * validate it the same way AuthService already does for HTTP requests,
 * and scope broadcasts to a per-tenant room so one clinic never receives
 * another tenant's updates.
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

    client.data.tenantId = session.tenantId;
    client.data.userId = session.userId;
    client.join(`tenant:${session.tenantId}`);
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
