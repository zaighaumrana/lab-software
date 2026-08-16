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
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

function resolveBranchId(user: AuthUser): string {
  return user.branchId || process.env.DEFAULT_BRANCH_ID || 'default-branch';
}

/**
 * Staff-facing booking management — only called from apps/web (verified:
 * not referenced from apps/website), so this requires a valid session
 * (see catalog.controller.ts for the same pattern). Previously
 * unguarded: tenantId came from a client-supplied `x-tenant-id` header,
 * meaning any request that could reach the API could create, confirm, or
 * cancel bookings with no login at all. tenantId now comes from the
 * verified session (@CurrentUser()) instead of trusting whatever the
 * client claims.
 */
@Controller('bookings')
@UseGuards(SessionGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  /**
   * GET /bookings/code/:bookingCode
   * Lookup by the human-readable / SMS booking code.
   */
  @Get('code/:bookingCode')
  async findByCode(@CurrentUser() user: AuthUser, @Param('bookingCode') bookingCode: string) {
    return this.bookingsService.findByCode(user.tenantId, bookingCode);
  }

  /**
   * GET /bookings/:id
   */
  @Get(':id')
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookingsService.findById(user.tenantId, id);
  }

  /**
   * POST /bookings
   * Create walk-in / phone / home-collection booking.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingDto) {
    return this.bookingsService.create(user.tenantId, resolveBranchId(user), dto);
  }

  /**
   * PATCH /bookings/:id/confirm
   * Accept an online booking (PENDING_REVIEW → CONFIRMED)
   */
  @Patch(':id/confirm')
  async confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookingsService.confirm(user.tenantId, id);
  }

  /**
   * PATCH /bookings/:id/check-in
   * Patient arrives (CONFIRMED → CHECKED_IN)
   */
  @Patch(':id/check-in')
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
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.bookingsService.cancel(user.tenantId, id, body?.reason);
  }
}
