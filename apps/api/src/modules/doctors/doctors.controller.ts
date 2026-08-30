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
import { DoctorsService, DoctorDashboardQuery } from './doctors.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { SessionGuard } from '../../common/guards/session.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequireAnyPermission } from '../../common/decorators/require-any-permission.decorator';
import { Permission } from '../../common/auth/permissions';
import { roleHasPermission } from '../../common/auth/role-permissions';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

/**
 * Requires a valid session, and every route declares the exact
 * permission it needs (PermissionGuard denies by default if a route has
 * neither @RequirePermissions nor @RequireAnyPermission).
 *
 * `list()` is the one route with mixed access: it needs EITHER
 * DOCTOR_REFERENCE_VIEW (LAB_OPERATOR — backs the referring-doctor
 * picker in patient registration) OR DOCTOR_MANAGE (ADMIN — full doctor
 * administration) — declared via @RequireAnyPermission, enforced by
 * PermissionGuard before the handler runs. The response SHAPE still
 * differs between the two (DOCTOR_REFERENCE_VIEW strips commission
 * fields), which is a data-shaping decision the handler makes itself via
 * roleHasPermission — that's a different question from whether the
 * request is allowed in at all, which is now fully the guard's job, not
 * something checked in the method body. (An earlier version of this
 * route tried to do both — access control AND shaping — as a manual
 * in-body check with no decorator at all, which meant PermissionGuard's
 * fail-closed default rejected every request before the body ever ran,
 * for every role. See require-any-permission.decorator.ts.)
 *
 * Every other route (findOne, dashboard, create, update) is real doctor
 * financial/administrative data and stays DOCTOR_MANAGE-only, matching
 * docs/12_RBAC_and_Operator_Dashboard.md.
 */
@Controller('doctors')
@UseGuards(SessionGuard, PermissionGuard)
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  /**
   * GET /doctors
   * Access: DOCTOR_REFERENCE_VIEW or DOCTOR_MANAGE, either is enough.
   * Shape: DOCTOR_MANAGE gets full records; DOCTOR_REFERENCE_VIEW gets
   * commission fields stripped (see doctors.service.ts#list).
   */
  @Get()
  @RequireAnyPermission(Permission.DOCTOR_REFERENCE_VIEW, Permission.DOCTOR_MANAGE)
  async list(
    @CurrentUser() user: AuthUser,
    @Query('all') all?: string,
  ) {
    const canManage = roleHasPermission(user.role, Permission.DOCTOR_MANAGE);
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
