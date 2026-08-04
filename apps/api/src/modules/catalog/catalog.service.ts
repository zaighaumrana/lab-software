import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateTestDto,
  TestParameterDto,
  ParameterValueTypeDto,
} from './dto/create-test.dto';
import { CreatePackageDto } from './dto/create-package.dto';
import { Decimal, ParameterValueType, Gender } from '@lms/database';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listTests(tenantId: string, activeOnly = true) {
    return this.prisma.test.findMany({
      where: {
        tenantId,
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: {
        parameters: {
          orderBy: { sortOrder: 'asc' },
          include: {
            referenceRanges: true,
            choices: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });
  }

  async getTest(tenantId: string, id: string) {
    const test = await this.prisma.test.findFirst({
      where: { id, tenantId },
      include: {
        parameters: {
          orderBy: { sortOrder: 'asc' },
          include: {
            referenceRanges: true,
            choices: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });
    if (!test) throw new NotFoundException('Test not found');
    return test;
  }

  async createTest(tenantId: string, dto: CreateTestDto) {
    const existing = await this.prisma.test.findFirst({
      where: { tenantId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`Test code ${dto.code} already exists`);
    }

    const parameters: TestParameterDto[] = dto.parameters?.length
      ? dto.parameters
      : [
          {
            code: dto.code.toUpperCase(),
            name: dto.name,
            valueType: ParameterValueTypeDto.NUMERIC,
            sortOrder: 0,
            isRequired: true,
          },
        ];

    const isPanel = dto.isPanel ?? parameters.length > 1;

    return this.prisma.test.create({
      data: {
        tenantId,
        code: dto.code.toUpperCase(),
        name: dto.name,
        category: dto.category,
        sampleType: dto.sampleType,
        basePrice: new Decimal(dto.basePrice),
        turnaroundHours: dto.turnaroundHours,
        description: dto.description,
        isActive: dto.isActive ?? true,
        isPanel,
        parameters: {
          create: parameters.map((p, idx) => ({
            code: p.code.toUpperCase(),
            name: p.name,
            valueType:
              (p.valueType as ParameterValueType) ?? ParameterValueType.NUMERIC,
            unit: p.unit,
            sortOrder: p.sortOrder ?? idx,
            isRequired: p.isRequired ?? true,
            decimalPlaces: p.decimalPlaces,
            referenceRanges: p.referenceRanges?.length
              ? {
                  create: p.referenceRanges.map((r) => ({
                    gender: (r.gender as Gender) ?? null,
                    ageMinMonths: r.ageMinMonths ?? null,
                    ageMaxMonths: r.ageMaxMonths ?? null,
                    lowNormal:
                      r.lowNormal != null ? new Decimal(r.lowNormal) : null,
                    highNormal:
                      r.highNormal != null ? new Decimal(r.highNormal) : null,
                    criticalLow:
                      r.criticalLow != null ? new Decimal(r.criticalLow) : null,
                    criticalHigh:
                      r.criticalHigh != null
                        ? new Decimal(r.criticalHigh)
                        : null,
                    unit: r.unit,
                    interpretation: r.interpretation,
                  })),
                }
              : undefined,
            choices: p.choices?.length
              ? {
                  create: p.choices.map((c, cidx) => ({
                    value: c.value,
                    label: c.label,
                    sortOrder: c.sortOrder ?? cidx,
                  })),
                }
              : undefined,
          })),
        },
      },
      include: {
        parameters: {
          include: { referenceRanges: true, choices: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async updateTest(tenantId: string, id: string, dto: Partial<CreateTestDto>) {
    await this.getTest(tenantId, id);

    return this.prisma.test.update({
      where: { id },
      data: {
        ...(dto.code !== undefined ? { code: dto.code.toUpperCase() } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.sampleType !== undefined ? { sampleType: dto.sampleType } : {}),
        ...(dto.basePrice !== undefined
          ? { basePrice: new Decimal(dto.basePrice) }
          : {}),
        ...(dto.turnaroundHours !== undefined
          ? { turnaroundHours: dto.turnaroundHours }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.isPanel !== undefined ? { isPanel: dto.isPanel } : {}),
      },
      include: {
        parameters: {
          include: { referenceRanges: true, choices: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  /**
   * Replace the full parameter list (and their reference ranges / choices) of
   * an existing test. Used by the admin catalog editor — simpler and safer
   * than granular per-parameter patch endpoints for a form that edits the
   * whole parameter list at once.
   */
  async replaceParameters(
    tenantId: string,
    testId: string,
    parameters: TestParameterDto[],
  ) {
    await this.getTest(tenantId, testId);

    if (!parameters || parameters.length === 0) {
      throw new ConflictException('A test must have at least one parameter');
    }

    await this.prisma.$transaction(async (tx) => {
      // Cascade delete removes reference ranges & choices for the old parameters.
      await tx.testParameter.deleteMany({ where: { testId } });

      for (const [idx, p] of parameters.entries()) {
        await tx.testParameter.create({
          data: {
            testId,
            code: p.code.toUpperCase(),
            name: p.name,
            valueType:
              (p.valueType as ParameterValueType) ?? ParameterValueType.NUMERIC,
            unit: p.unit,
            sortOrder: p.sortOrder ?? idx,
            isRequired: p.isRequired ?? true,
            decimalPlaces: p.decimalPlaces,
            referenceRanges: p.referenceRanges?.length
              ? {
                  create: p.referenceRanges.map((r) => ({
                    gender: (r.gender as Gender) ?? null,
                    ageMinMonths: r.ageMinMonths ?? null,
                    ageMaxMonths: r.ageMaxMonths ?? null,
                    lowNormal:
                      r.lowNormal != null ? new Decimal(r.lowNormal) : null,
                    highNormal:
                      r.highNormal != null ? new Decimal(r.highNormal) : null,
                    criticalLow:
                      r.criticalLow != null ? new Decimal(r.criticalLow) : null,
                    criticalHigh:
                      r.criticalHigh != null
                        ? new Decimal(r.criticalHigh)
                        : null,
                    unit: r.unit,
                    interpretation: r.interpretation,
                  })),
                }
              : undefined,
            choices: p.choices?.length
              ? {
                  create: p.choices.map((c, cidx) => ({
                    value: c.value,
                    label: c.label,
                    sortOrder: c.sortOrder ?? cidx,
                  })),
                }
              : undefined,
          },
        });
      }

      await tx.test.update({
        where: { id: testId },
        data: { isPanel: parameters.length > 1 },
      });
    });

    return this.getTest(tenantId, testId);
  }

  async listPackages(tenantId: string, activeOnly = true) {
    return this.prisma.package.findMany({
      where: {
        tenantId,
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        items: { include: { test: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  async getPackage(tenantId: string, id: string) {
    const pkg = await this.prisma.package.findFirst({
      where: { id, tenantId },
      include: {
        items: { include: { test: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!pkg) throw new NotFoundException('Package not found');
    return pkg;
  }

  async createPackage(tenantId: string, dto: CreatePackageDto) {
    const existing = await this.prisma.package.findFirst({
      where: { tenantId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`Package code ${dto.code} already exists`);
    }

    if (dto.testIds.length > 0) {
      const tests = await this.prisma.test.findMany({
        where: { tenantId, id: { in: dto.testIds } },
      });
      if (tests.length !== dto.testIds.length) {
        throw new NotFoundException('One or more test IDs are invalid');
      }
    }

    return this.prisma.package.create({
      data: {
        tenantId,
        code: dto.code.toUpperCase(),
        name: dto.name,
        basePrice: new Decimal(dto.basePrice),
        description: dto.description,
        isActive: dto.isActive ?? true,
        items: {
          create: dto.testIds.map((testId, idx) => ({
            testId,
            sortOrder: idx,
          })),
        },
      },
      include: {
        items: { include: { test: true } },
      },
    });
  }
}