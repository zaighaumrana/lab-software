import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';
import { SessionGuard } from '../../common/guards/session.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/login
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * POST /auth/logout
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Headers('authorization') authHeader?: string,
    @Headers('x-session-id') sessionHeader?: string,
  ) {
    let sessionId: string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      sessionId = authHeader.slice(7);
    } else if (sessionHeader) {
      sessionId = sessionHeader;
    }
    if (sessionId) {
      this.authService.logout(sessionId);
    }
    return { ok: true };
  }

  /**
   * GET /auth/me
   * Requires valid session.
   */
  @Get('me')
  @UseGuards(SessionGuard)
  async me(@CurrentUser() user: AuthUser) {
    return user;
  }

  /**
   * PATCH /auth/me
   * Self-service profile update — any logged-in user, any role. No
   * permission check beyond "is logged in": this is intentionally not
   * gated by PermissionGuard/RequirePermissions, because editing your
   * own name/password isn't an admin-vs-operator distinction, it's
   * something every account should be able to do for itself. Role is
   * never editable here — see UpdateOwnProfileDto.
   */
  @Patch('me')
  @UseGuards(SessionGuard)
  async updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateOwnProfileDto) {
    return this.authService.updateOwnProfile(user.userId, user.tenantId, dto);
  }
}
