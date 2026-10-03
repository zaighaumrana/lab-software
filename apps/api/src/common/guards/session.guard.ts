import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../../modules/auth/auth.service';
import { auditContext } from '../audit';

/**
 * Simple session guard.
 * Expects header: Authorization: Bearer <sessionId>
 * or cookie / x-session-id header.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'] as string | undefined;
    const sessionHeader = request.headers['x-session-id'] as string | undefined;

    let sessionId: string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      sessionId = authHeader.slice(7);
    } else if (sessionHeader) {
      sessionId = sessionHeader;
    }

    const session = await this.authService.validateSession(sessionId);
    if (!session) {
      throw new UnauthorizedException('Authentication required');
    }

    const audit = auditContext.getStore();
    if (audit) Object.assign(audit, { actorId: session.userId, tenantId: session.tenantId, sessionRecordId: session.sessionRecordId });
    // Attach current persisted authorization, never a login-time snapshot.
    request.user = {
      userId: session.userId,
      tenantId: session.tenantId,
      branchId: session.branchId,
      role: session.role,
      fullName: session.fullName,
      username: session.username,
    };

    return true;
  }
}
