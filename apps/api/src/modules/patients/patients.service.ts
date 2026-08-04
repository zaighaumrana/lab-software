import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { Prisma } from '@lms/database';

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search patients by phone, CNIC, or name.
   * Phone and CNIC are preferred match keys (typo-tolerant name is secondary).
   */
  async search(tenantId: string, query: string, take = 20) {
    const q = query.trim();
    if (q.length < 2) {
      throw new BadRequestException('Search query must be at least 2 characters');
    }

    // Exact-ish matches first (phone / CNIC), then fuzzy name
    const patients = await this.prisma.patient.findMany({
      where: {
        tenantId,
        OR: [
          { phone: { contains: q } },
          { phoneAlt: { contains: q } },
          { cnic: { contains: q } },
          { fullName: { contains: q, mode: 'insensitive' } },
          { mrn: { equals: q } },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }],
      take,
      include: {
        companyLinks: {
          where: { isActive: true },
          include: { company: { select: { id: true, name: true, code: true } } },
        },
      },
    });

    return patients;
  }

  async findById(tenantId: string, id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, tenantId },
      include: {
        companyLinks: {
          where: { isActive: true },
          include: { company: true },
        },
        bookings: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            bookingCode: true,
            status: true,
            source: true,
            createdAt: true,
          },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return patient;
  }

  async create(tenantId: string, dto: CreatePatientDto, branchId?: string) {
    // Prevent duplicate phone within tenant
    const existing = await this.prisma.patient.findFirst({
      where: { tenantId, phone: dto.phone },
    });

    if (existing) {
      throw new ConflictException(
        `A patient with phone ${dto.phone} already exists (ID: ${existing.id}). Use search and select the existing record.`,
      );
    }

    if (dto.cnic) {
      const existingCnic = await this.prisma.patient.findFirst({
        where: { tenantId, cnic: dto.cnic },
      });
      if (existingCnic) {
        throw new ConflictException(
          `A patient with CNIC ${dto.cnic} already exists (ID: ${existingCnic.id}).`,
        );
      }
    }

    const patient = await this.prisma.patient.create({
      data: {
        tenantId,
        branchId: branchId ?? null,
        fullName: dto.fullName.trim(),
        phone: dto.phone,
        phoneAlt: dto.phoneAlt,
        cnic: dto.cnic,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        gender: dto.gender ?? null,
        address: dto.address,
        email: dto.email,
        bloodGroup: dto.bloodGroup,
        notes: dto.notes,
        smsConsent: dto.smsConsent ?? true,
      },
    });

    // TODO: raise PatientRegistered domain event (notifications / audit)
    return patient;
  }

  async update(tenantId: string, id: string, dto: UpdatePatientDto) {
    await this.findById(tenantId, id); // throws if not found

    if (dto.phone) {
      const conflict = await this.prisma.patient.findFirst({
        where: {
          tenantId,
          phone: dto.phone,
          NOT: { id },
        },
      });
      if (conflict) {
        throw new ConflictException(`Phone ${dto.phone} is already used by another patient`);
      }
    }

    if (dto.cnic) {
      const conflict = await this.prisma.patient.findFirst({
        where: {
          tenantId,
          cnic: dto.cnic,
          NOT: { id },
        },
      });
      if (conflict) {
        throw new ConflictException(`CNIC ${dto.cnic} is already used by another patient`);
      }
    }

    const data: Prisma.PatientUpdateInput = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName.trim();
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.phoneAlt !== undefined) data.phoneAlt = dto.phoneAlt;
    if (dto.cnic !== undefined) data.cnic = dto.cnic;
    if (dto.dateOfBirth !== undefined)
      data.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.bloodGroup !== undefined) data.bloodGroup = dto.bloodGroup;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.smsConsent !== undefined) data.smsConsent = dto.smsConsent;

    return this.prisma.patient.update({
      where: { id },
      data,
    });
  }
}
