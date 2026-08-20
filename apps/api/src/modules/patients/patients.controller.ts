import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { SearchPatientDto } from './dto/search-patient.dto';
import { SessionGuard } from '../../common/guards/session.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Permission } from '../../common/auth/permissions';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

/**
 * Patient records — real PII (name, contact info, CNIC) — so this
 * controller requires a valid session, and every route declares the
 * exact permission it needs (PermissionGuard denies by default if a
 * route has no @RequirePermissions). LAB_OPERATOR has full patient
 * view/create/update per docs/12_RBAC_and_Operator_Dashboard.md — this
 * is core operational workflow, not administrative data.
 */
@Controller('patients')
@UseGuards(SessionGuard, PermissionGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  /**
   * GET /patients/search?q=03001234567
   * Phone / CNIC / name search — primary entry point for reception.
   */
  @Get('search')
  @RequirePermissions(Permission.PATIENT_VIEW)
  async search(@CurrentUser() user: AuthUser, @Query() query: SearchPatientDto) {
    return this.patientsService.search(user.tenantId, query.q);
  }

  /**
   * GET /patients/:id
   */
  @Get(':id')
  @RequirePermissions(Permission.PATIENT_VIEW)
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.patientsService.findById(user.tenantId, id);
  }

  /**
   * POST /patients
   * Register a new patient.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.PATIENT_CREATE)
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreatePatientDto) {
    return this.patientsService.create(user.tenantId, dto, user.branchId ?? undefined);
  }

  /**
   * PATCH /patients/:id
   */
  @Patch(':id')
  @RequirePermissions(Permission.PATIENT_UPDATE)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patientsService.update(user.tenantId, id, dto);
  }
}
