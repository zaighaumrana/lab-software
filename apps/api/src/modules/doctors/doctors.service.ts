import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { ShareType, Decimal, Prisma } from '@lms/database';

export interface DoctorDashboardQuery {
  from?: string;
  to?: string;
  search?: string;
  sortBy?: 'date' | 'patientName' | 'invoiceAmount' | 'shareAmount';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `stripFinancials` backs the referring-doctor picker used during
   * patient registration (DOCTOR_REFERENCE_VIEW — see permissions.ts):
   * a non-admin caller needs the doctor's name/specialty to pick a
   * referrer, never their commission rate. ADMIN callers (DOCTOR_MANAGE)
   * pass false and get the full record, same as before.
   */
  async list(tenantId: string, activeOnly = true, stripFinancials = false) {
    const doctors = await this.prisma.doctor.findMany({
      where: {
        tenantId,
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: { fullName: 'asc' },
    });
    if (!stripFinancials) return doctors;
    return doctors.map(({ shareType: _shareType, shareValue: _shareValue, ...rest }) => rest);
  }

  async findById(tenantId: string, id: string) {
    const doctor = await this.prisma.doctor.findFirst({
      where: { id, tenantId },
      include: {
        shares: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            invoice: {
              select: {
                invoiceNumber: true,
                grandTotal: true,
                status: true,
              },
            },
          },
        },
      },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');
    return doctor;
  }

  async create(tenantId: string, dto: CreateDoctorDto) {
    return this.prisma.doctor.create({
      data: {
        tenantId,
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email,
        specialty: dto.specialty,
        clinicName: dto.clinicName,
        shareType: (dto.shareType as ShareType) ?? ShareType.PERCENTAGE,
        shareValue: new Decimal(dto.shareValue ?? 0),
        notes: dto.notes,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(tenantId: string, id: string, dto: Partial<CreateDoctorDto>) {
    await this.findById(tenantId, id);

    return this.prisma.doctor.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.specialty !== undefined ? { specialty: dto.specialty } : {}),
        ...(dto.clinicName !== undefined ? { clinicName: dto.clinicName } : {}),
        ...(dto.shareType !== undefined
          ? { shareType: dto.shareType as ShareType }
          : {}),
        ...(dto.shareValue !== undefined
          ? { shareValue: new Decimal(dto.shareValue) }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  /**
   * Doctor Dashboard: summary totals + a searchable/sortable/paginated list
   * of every patient referred by this doctor, scoped to an optional date
   * range. Every "commission" concept here is surfaced to the client as
   * "share" — no exceptions.
   */
  async dashboard(tenantId: string, doctorId: string, query: DoctorDashboardQuery) {
    const doctor = await this.prisma.doctor.findFirst({
      where: { id: doctorId, tenantId },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');

    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (to) to.setHours(23, 59, 59, 999);

    const dateFilter: Prisma.DoctorShareWhereInput['invoice'] = {
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const shares = await this.prisma.doctorShare.findMany({
      where: {
        tenantId,
        doctorId,
        invoice: dateFilter,
      },
      include: {
        invoice: {
          include: {
            booking: { include: { patient: true } },
            lines: { include: { test: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // ----- Summary -----
    const patientIds = new Set(shares.map((s) => s.invoice.booking?.patientId).filter(Boolean));
    const totalRevenue = shares.reduce((sum, s) => sum + Number(s.invoice.grandTotal), 0);
    const totalShare = shares.reduce((sum, s) => sum + Number(s.calculatedAmount), 0);
    const totalPaid = shares.reduce((sum, s) => sum + Number(s.paidAmount ?? 0), 0);
    const pendingShare = totalShare - totalPaid;

    // ----- Patient list rows -----
    let rows = shares.map((s) => ({
      shareId: s.id,
      invoiceId: s.invoice.id,
      invoiceNumber: s.invoice.invoiceNumber,
      patientName: s.invoice.booking?.patient?.fullName ?? '—',
      date: s.invoice.createdAt,
      tests: s.invoice.lines.map((l) => l.test?.name ?? l.description).filter(Boolean),
      invoiceAmount: Number(s.invoice.grandTotal),
      shareAmount: Number(s.calculatedAmount),
      paymentStatus: s.invoice.status,
      shareStatus: s.status,
    }));

    if (query.search?.trim()) {
      const q = query.search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.patientName.toLowerCase().includes(q) ||
          r.invoiceNumber.toLowerCase().includes(q) ||
          r.tests.some((t) => t.toLowerCase().includes(q)),
      );
    }

    const sortBy = query.sortBy ?? 'date';
    const sortDir = query.sortDir ?? 'desc';
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortBy) {
        case 'patientName':
          return a.patientName.localeCompare(b.patientName) * dir;
        case 'invoiceAmount':
          return (a.invoiceAmount - b.invoiceAmount) * dir;
        case 'shareAmount':
          return (a.shareAmount - b.shareAmount) * dir;
        case 'date':
        default:
          return (new Date(a.date).getTime() - new Date(b.date).getTime()) * dir;
      }
    });

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const total = rows.length;
    const paged = rows.slice((page - 1) * pageSize, page * pageSize);

    return {
      doctor: {
        id: doctor.id,
        fullName: doctor.fullName,
        phone: doctor.phone,
        email: doctor.email,
        specialty: doctor.specialty,
        clinicName: doctor.clinicName,
        shareType: doctor.shareType,
        shareValue: doctor.shareValue,
      },
      range: { from: query.from ?? null, to: query.to ?? null },
      summary: {
        totalPatients: patientIds.size,
        totalRevenue,
        totalShare,
        totalPaid,
        pendingShare,
      },
      patients: {
        rows: paged,
        total,
        page,
        pageSize,
      },
    };
  }
}
