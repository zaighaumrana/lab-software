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
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

/**
 * Patient records — real PII (name, contact info, CNIC) — so this
 * controller requires a valid session (see catalog.controller.ts for the
 * same pattern). Previously unguarded: tenantId came from a
 * client-supplied `x-tenant-id` header, meaning any request that could
 * reach the API could search, view, register, or edit patients with no
 * login at all. tenantId now comes from the verified session
 * (@CurrentUser()) instead of trusting whatever the client claims.
 */
@Controller('patients')
@UseGuards(SessionGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  /**
   * GET /patients/search?q=03001234567
   * Phone / CNIC / name search — primary entry point for reception.
   */
  @Get('search')
  async search(@CurrentUser() user: AuthUser, @Query() query: SearchPatientDto) {
    return this.patientsService.search(user.tenantId, query.q);
  }

  /**
   * GET /patients/:id
   */
  @Get(':id')
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.patientsService.findById(user.tenantId, id);
  }

  /**
   * POST /patients
   * Register a new patient.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreatePatientDto) {
    return this.patientsService.create(user.tenantId, dto, user.branchId ?? undefined);
  }

  /**
   * PATCH /patients/:id
   */
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patientsService.update(user.tenantId, id, dto);
  }
}
