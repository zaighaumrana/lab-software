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
 * Tenant room: taken from the validated session (session.tenantId), the
 * same way `laboratory.controller.ts` now resolves tenantId too (it uses
 * @CurrentUser() off the same session, since SessionGuard was added
 * there). Both sides deriving tenant identity from the one verified
 * session is what keeps the room key correct here — they need to always
 * agree, because a mismatch means sockets silently sit in a room nothing
 * ever broadcasts to, with no visible error anywhere. (This bit the app
 * twice already, in both directions — once when the gateway used the
 * session while REST used a header, and again when REST was fixed to use
 * the session but the gateway had been changed to match the old header
 * instead. Both sides now derive from the session, so there's only one
 * source of truth left to keep in sync.)
 *
 * This deployment uses one notification server with durable database sessions,
 * so the default in-memory socket.io adapter is
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

  async handleConnection(client: Socket) {
    const sessionId =
      (client.handshake.auth?.sessionId as string | undefined) ??
      (client.handshake.query?.sessionId as string | undefined);

    const session = await this.authService.validateSession(sessionId).catch(() => null);
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

  notifyInvoiceChanged(tenantId: string, invoiceId: string) {
    this.server?.to(`tenant:${tenantId}`).emit('invoice:changed', { invoiceId });
  }
}
