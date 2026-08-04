import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CheckInBookingDto } from './dto/check-in-booking.dto';

function resolveTenantId(header?: string): string {
  return header || process.env.DEFAULT_TENANT_ID || 'default-tenant';
}

function resolveBranchId(header?: string): string {
  return header || process.env.DEFAULT_BRANCH_ID || 'default-branch';
}

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  /**
   * GET /bookings/code/:bookingCode
   * Lookup by the human-readable / SMS booking code.
   */
  @Get('code/:bookingCode')
  async findByCode(
    @Param('bookingCode') bookingCode: string,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.bookingsService.findByCode(tenantId, bookingCode);
  }

  /**
   * GET /bookings/:id
   */
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.bookingsService.findById(tenantId, id);
  }

  /**
   * POST /bookings
   * Create walk-in / phone / home-collection booking.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateBookingDto,
    @Headers('x-tenant-id') tenantHeader?: string,
    @Headers('x-branch-id') branchHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    const branchId = resolveBranchId(branchHeader);
    return this.bookingsService.create(tenantId, branchId, dto);
  }

  /**
   * PATCH /bookings/:id/confirm
   * Accept an online booking (PENDING_REVIEW → CONFIRMED)
   */
  @Patch(':id/confirm')
  async confirm(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.bookingsService.confirm(tenantId, id);
  }

  /**
   * PATCH /bookings/:id/check-in
   * Patient arrives (CONFIRMED → CHECKED_IN)
   */
  @Patch(':id/check-in')
  async checkIn(
    @Param('id') id: string,
    @Body() _dto: CheckInBookingDto,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.bookingsService.checkIn(tenantId, id);
  }

  /**
   * PATCH /bookings/:id/cancel
   */
  @Patch(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.bookingsService.cancel(tenantId, id, body?.reason);
  }
}
