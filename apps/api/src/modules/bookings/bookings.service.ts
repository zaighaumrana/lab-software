import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingStatus, BookingSource } from '@lms/database';

function generateBookingCode(): string {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `BK-${datePart}-${random}`;
}

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByCode(tenantId: string, bookingCode: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { tenantId, bookingCode },
      include: {
        patient: true,
        doctor: true,
        invoice: {
          include: {
            lines: true,
            payments: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking ${bookingCode} not found`);
    }
    return booking;
  }

  async findById(tenantId: string, id: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, tenantId },
      include: {
        patient: true,
        doctor: true,
        invoice: {
          include: { lines: true, payments: true },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    return booking;
  }

  /**
   * Create a walk-in (or phone / home-collection) booking.
   * Online bookings enter as PENDING_REVIEW; walk-ins go straight to CONFIRMED.
   */
  async create(tenantId: string, branchId: string, dto: CreateBookingDto) {
    // Validate patient belongs to tenant
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    if (dto.doctorId) {
      const doctor = await this.prisma.doctor.findFirst({
        where: { id: dto.doctorId, tenantId },
      });
      if (!doctor) {
        throw new NotFoundException('Doctor not found');
      }
    }

    const source = (dto.source as BookingSource) || BookingSource.WALK_IN;
    const initialStatus =
      source === BookingSource.ONLINE
        ? BookingStatus.PENDING_REVIEW
        : BookingStatus.CONFIRMED;

    let bookingCode = generateBookingCode();
    // Extremely unlikely collision retry
    for (let i = 0; i < 3; i++) {
      const exists = await this.prisma.booking.findFirst({
        where: { tenantId, bookingCode },
      });
      if (!exists) break;
      bookingCode = generateBookingCode();
    }

    const booking = await this.prisma.booking.create({
      data: {
        tenantId,
        branchId,
        patientId: dto.patientId,
        doctorId: dto.doctorId,
        companyId: dto.companyId,
        status: initialStatus,
        source,
        bookingCode,
        notes: dto.notes,
        preferredAt: dto.preferredAt ? new Date(dto.preferredAt) : null,
        homeAddress: dto.homeAddress,
        homeCollectorId: dto.homeCollectorId,
        homeRouteNotes: dto.homeRouteNotes,
        homeTimeWindowStart: dto.homeTimeWindowStart
          ? new Date(dto.homeTimeWindowStart)
          : null,
        homeTimeWindowEnd: dto.homeTimeWindowEnd
          ? new Date(dto.homeTimeWindowEnd)
          : null,
      },
      include: {
        patient: true,
        doctor: true,
      },
    });

    // Booking creation itself is not one of the LMS's two automatic SMS
    // events (see @lms/shared sms-events.ts) — the patient is notified by
    // SMS once samples are actually collected instead (LaboratoryService
    // .collectSample -> SAMPLE_COLLECTED), which also means no hardcoded
    // wording lives here anymore.

    return booking;
  }

  /**
   * Staff accepts an online booking (PENDING_REVIEW → CONFIRMED)
   */
  async confirm(tenantId: string, id: string) {
    const booking = await this.findById(tenantId, id);

    if (booking.status !== BookingStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        `Cannot confirm booking in status ${booking.status}. Only PENDING_REVIEW can be confirmed.`,
      );
    }

    return this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.CONFIRMED },
      include: { patient: true, doctor: true },
    });
  }

  /**
   * Patient arrives → CHECKED_IN
   */
  async checkIn(tenantId: string, id: string) {
    const booking = await this.findById(tenantId, id);

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException(
        `Cannot check in booking in status ${booking.status}. Only CONFIRMED bookings can be checked in.`,
      );
    }

    return this.prisma.booking.update({
      where: { id },
      data: {
        status: BookingStatus.CHECKED_IN,
        checkedInAt: new Date(),
      },
      include: { patient: true, doctor: true },
    });
  }

  /**
   * Cancel a booking (allowed from PENDING_REVIEW, CONFIRMED, CHECKED_IN)
   */
  async cancel(tenantId: string, id: string, reason?: string) {
    const booking = await this.findById(tenantId, id);

    const cancellable: BookingStatus[] = [
      BookingStatus.PENDING_REVIEW,
      BookingStatus.CONFIRMED,
      BookingStatus.CHECKED_IN,
    ];

    if (!cancellable.includes(booking.status)) {
      throw new BadRequestException(
        `Cannot cancel booking in status ${booking.status}.`,
      );
    }

    // If already converted to invoice, cancellation must go through invoice void/refund
    if (booking.status === BookingStatus.CONVERTED || booking.invoice) {
      throw new BadRequestException(
        'Booking already has an invoice. Void or refund the invoice instead.',
      );
    }

    return this.prisma.booking.update({
      where: { id },
      data: {
        status: BookingStatus.CANCELLED,
        notes: reason
          ? `${booking.notes ?? ''}\n[Cancelled] ${reason}`.trim()
          : booking.notes,
      },
    });
  }

  /**
   * Mark booking as CONVERTED after invoice is issued.
   * Called by BillingService — not exposed directly as a public endpoint.
   */
  async markConverted(tenantId: string, id: string) {
    const booking = await this.findById(tenantId, id);

    if (
      booking.status !== BookingStatus.CHECKED_IN &&
      booking.status !== BookingStatus.CONFIRMED
    ) {
      throw new BadRequestException(
        `Cannot convert booking in status ${booking.status}.`,
      );
    }

    return this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.CONVERTED },
    });
  }
}
