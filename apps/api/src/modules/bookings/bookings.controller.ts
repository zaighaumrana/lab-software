import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CheckInBookingDto } from './dto/check-in-booking.dto';
import { SessionGuard } from '../../common/guards/session.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Permission } from '../../common/auth/permissions';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

function resolveBranchId(user: AuthUser): string {
  return user.branchId || process.env.DEFAULT_BRANCH_ID || 'default-branch';
}

/**
 * Internal LabFlow booking management for the staff application.
 * Requires a valid session, and every route declares the exact
 * permission it needs (PermissionGuard denies
 * by default if a route has no @RequirePermissions). LAB_OPERATOR has
 * full booking view/create/manage per
 * docs/12_RBAC_and_Operator_Dashboard.md.
 */
@Controller('bookings')
@UseGuards(SessionGuard, PermissionGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  /**
   * GET /bookings/code/:bookingCode
   * Lookup by the human-readable / SMS booking code.
   */
  @Get('code/:bookingCode')
  @RequirePermissions(Permission.BOOKING_VIEW)
  async findByCode(@CurrentUser() user: AuthUser, @Param('bookingCode') bookingCode: string) {
    return this.bookingsService.findByCode(user.tenantId, bookingCode);
  }

  /**
   * GET /bookings/:id
   */
  @Get(':id')
  @RequirePermissions(Permission.BOOKING_VIEW)
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookingsService.findById(user.tenantId, id);
  }

  /**
   * POST /bookings
   * Create walk-in / phone / home-collection booking.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.BOOKING_CREATE)
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingDto) {
    return this.bookingsService.create(user.tenantId, resolveBranchId(user), dto);
  }

  /**
   * PATCH /bookings/:id/confirm
   * Accept an online booking (PENDING_REVIEW -> CONFIRMED)
   */
  @Patch(':id/confirm')
  @RequirePermissions(Permission.BOOKING_MANAGE)
  async confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookingsService.confirm(user.tenantId, id);
  }

  /**
   * PATCH /bookings/:id/check-in
   * Patient arrives (CONFIRMED -> CHECKED_IN)
   */
  @Patch(':id/check-in')
  @RequirePermissions(Permission.BOOKING_MANAGE)
  async checkIn(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() _dto: CheckInBookingDto,
  ) {
    return this.bookingsService.checkIn(user.tenantId, id);
  }

  /**
   * PATCH /bookings/:id/cancel
   */
  @Patch(':id/cancel')
  @RequirePermissions(Permission.BOOKING_MANAGE)
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.bookingsService.cancel(user.tenantId, id, body?.reason);
  }
}
