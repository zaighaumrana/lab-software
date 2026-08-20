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
  ForbiddenException,
} from '@nestjs/common';
import { DoctorsService, DoctorDashboardQuery } from './doctors.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { SessionGuard } from '../../common/guards/session.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Permission } from '../../common/auth/permissions';
import { roleHasPermission } from '../../common/auth/role-permissions';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

/**
 * Requires a valid session, and every route declares the exact
 * permission it needs (PermissionGuard denies by default if a route has
 * no @RequirePermissions).
 *
 * `list()` is the one route with mixed access: it needs
 * EITHER DOCTOR_REFERENCE_VIEW (LAB_OPERATOR — backs the referring-doctor
 * picker in patient registration) OR DOCTOR_MANAGE (ADMIN — full doctor
 * administration). PermissionGuard only expresses AND-of-required, so
 * this one route checks manually instead of via the decorator — see the
 * comment on the method. Every other route (findOne, dashboard, create,
 * update) is real doctor financial/administrative data and stays
 * DOCTOR_MANAGE-only, matching docs/12_RBAC_and_Operator_Dashboard.md.
 */
@Controller('doctors')
@UseGuards(SessionGuard, PermissionGuard)
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  /**
   * GET /doctors
   * Allowed for DOCTOR_REFERENCE_VIEW or DOCTOR_MANAGE — but the two get
   * a different shape: DOCTOR_REFERENCE_VIEW strips commission fields.
   * @RequirePermissions can't express "either of," so this route is
   * intentionally left undecorated and checks manually — PermissionGuard
   * would otherwise deny it by default (see that guard's comment), so
   * this is a deliberate, narrow exception, not an oversight.
   */
  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query('all') all?: string,
  ) {
    const canManage = roleHasPermission(user.role, Permission.DOCTOR_MANAGE);
    const canViewReference = roleHasPermission(user.role, Permission.DOCTOR_REFERENCE_VIEW);
    if (!canManage && !canViewReference) {
      throw new ForbiddenException(
        `Your role (${user.role}) does not have permission to view doctors.`,
      );
    }
    return this.doctorsService.list(user.tenantId, all !== 'true', !canManage);
  }

  @Get(':id')
  @RequirePermissions(Permission.DOCTOR_MANAGE)
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.doctorsService.findById(user.tenantId, id);
  }

  @Get(':id/dashboard')
  @RequirePermissions(Permission.DOCTOR_MANAGE)
  async dashboard(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: DoctorDashboardQuery['sortBy'],
    @Query('sortDir') sortDir?: DoctorDashboardQuery['sortDir'],
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.doctorsService.dashboard(user.tenantId, id, {
      from,
      to,
      search,
      sortBy,
      sortDir,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.DOCTOR_MANAGE)
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateDoctorDto,
  ) {
    return this.doctorsService.create(user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.DOCTOR_MANAGE)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<CreateDoctorDto>,
  ) {
    return this.doctorsService.update(user.tenantId, id, dto);
  }
}
