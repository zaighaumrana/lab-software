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
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { SearchPatientDto } from './dto/search-patient.dto';

/**
 * Temporary tenant resolution until full auth is wired.
 * For this client's single-tenant deployment we accept x-tenant-id header
 * or fall back to a default. Real auth guard will replace this later.
 */
function resolveTenantId(header?: string): string {
  // In production this comes from the authenticated session / JWT.
  // For local testing we accept a header or use a fixed placeholder.
  return header || process.env.DEFAULT_TENANT_ID || 'default-tenant';
}

@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  /**
   * GET /patients/search?q=03001234567
   * Phone / CNIC / name search — primary entry point for reception.
   */
  @Get('search')
  async search(
    @Query() query: SearchPatientDto,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.patientsService.search(tenantId, query.q);
  }

  /**
   * GET /patients/:id
   */
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.patientsService.findById(tenantId, id);
  }

  /**
   * POST /patients
   * Register a new patient.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreatePatientDto,
    @Headers('x-tenant-id') tenantHeader?: string,
    @Headers('x-branch-id') branchId?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.patientsService.create(tenantId, dto, branchId);
  }

  /**
   * PATCH /patients/:id
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = resolveTenantId(tenantHeader);
    return this.patientsService.update(tenantId, id, dto);
  }
}
