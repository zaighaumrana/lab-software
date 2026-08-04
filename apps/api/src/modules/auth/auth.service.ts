import {
  Injectable,
  UnauthorizedException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

/** Simple in-memory session store for v1 (single-server, offline-first).
 *  Replace with Redis or DB-backed sessions when multi-instance SaaS is needed.
 */
interface Session {
  sessionId: string;
  userId: string;
  tenantId: string;
  branchId: string | null;
  role: string;
  fullName: string;
  username: string;
  createdAt: Date;
  lastSeenAt: Date;
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const sessions = new Map<string, Session>();

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Periodic cleanup of expired sessions
    setInterval(() => {
      const now = Date.now();
      for (const [id, session] of sessions) {
        if (now - session.lastSeenAt.getTime() > SESSION_TTL_MS) {
          sessions.delete(id);
        }
      }
    }, 60_000);
  }

  async login(dto: LoginDto) {
    // For single-tenant v1 we look up by username across the default tenant.
    // Multi-tenant login can add a tenant slug field later.
    const user = await this.prisma.user.findFirst({
      where: {
        username: dto.username,
        isActive: true,
      },
      include: { tenant: true, branch: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const sessionId = randomBytes(32).toString('hex');
    const session: Session = {
      sessionId,
      userId: user.id,
      tenantId: user.tenantId,
      branchId: user.branchId,
      role: user.role,
      fullName: user.fullName,
      username: user.username,
      createdAt: new Date(),
      lastSeenAt: new Date(),
    };
    sessions.set(sessionId, session);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      sessionId,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId,
        branchId: user.branchId,
      },
    };
  }

  logout(sessionId: string) {
    sessions.delete(sessionId);
    return { ok: true };
  }

  validateSession(sessionId: string | undefined): Session | null {
    if (!sessionId) return null;
    const session = sessions.get(sessionId);
    if (!session) return null;

    if (Date.now() - session.lastSeenAt.getTime() > SESSION_TTL_MS) {
      sessions.delete(sessionId);
      return null;
    }

    session.lastSeenAt = new Date();
    return session;
  }

  getSession(sessionId: string) {
    const session = this.validateSession(sessionId);
    if (!session) {
      throw new UnauthorizedException('Session expired or invalid');
    }
    return {
      userId: session.userId,
      tenantId: session.tenantId,
      branchId: session.branchId,
      role: session.role,
      fullName: session.fullName,
      username: session.username,
    };
  }
}
