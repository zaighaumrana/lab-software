import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { CommissionType, Decimal } from '@lms/database';

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, activeOnly = true) {
    return this.prisma.doctor.findMany({
      where: {
        tenantId,
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: { fullName: 'asc' },
    });
  }

  async findById(tenantId: string, id: string) {
    const doctor = await this.prisma.doctor.findFirst({
      where: { id, tenantId },
      include: {
        commissions: {
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
        commissionType:
          (dto.commissionType as CommissionType) ?? CommissionType.PERCENTAGE,
        commissionValue: new Decimal(dto.commissionValue ?? 0),
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
        ...(dto.commissionType !== undefined
          ? { commissionType: dto.commissionType as CommissionType }
          : {}),
        ...(dto.commissionValue !== undefined
          ? { commissionValue: new Decimal(dto.commissionValue) }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }
}
