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
import { CatalogService } from './catalog.service';
import { CreateTestDto, ReplaceTestParametersDto } from './dto/create-test.dto';
import { CreatePackageDto } from './dto/create-package.dto';
import { SessionGuard } from '../../common/guards/session.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Permission } from '../../common/auth/permissions';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

/**
 * Test/package catalog. Requires a valid session, and every route
 * declares the exact permission it needs (PermissionGuard denies by
 * default if a route has no @RequirePermissions).
 *
 * CATALOG_VIEW (LAB_OPERATOR has this) backs the test/package picker
 * embedded in patient registration (VisitPage.tsx) — the operator needs
 * to select "CBC" for a patient. CATALOG_MANAGE (ADMIN only) is
 * redefining what CBC actually is — parameters, reference ranges,
 * pricing. See docs/12_RBAC_and_Operator_Dashboard.md for the full
 * rationale; the standalone /catalog admin page on the frontend is
 * gated to ADMIN entirely (a route-level restriction, not an API one —
 * the API-level CATALOG_VIEW permission is what the *embedded* picker
 * relies on).
 */
@Controller('catalog')
@UseGuards(SessionGuard, PermissionGuard)
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  // ----- Tests -----

  @Get('tests')
  @RequirePermissions(Permission.CATALOG_VIEW)
  async listTests(
    @CurrentUser() user: AuthUser,
    @Query('all') all?: string,
  ) {
    return this.catalogService.listTests(user.tenantId, all !== 'true');
  }

  @Get('tests/:id')
  @RequirePermissions(Permission.CATALOG_VIEW)
  async getTest(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.catalogService.getTest(user.tenantId, id);
  }

  @Post('tests')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.CATALOG_MANAGE)
  async createTest(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTestDto,
  ) {
    return this.catalogService.createTest(user.tenantId, dto);
  }

  @Patch('tests/:id')
  @RequirePermissions(Permission.CATALOG_MANAGE)
  async updateTest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<CreateTestDto>,
  ) {
    return this.catalogService.updateTest(user.tenantId, id, dto);
  }

  @Patch('tests/:id/parameters')
  @RequirePermissions(Permission.CATALOG_MANAGE)
  async replaceParameters(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReplaceTestParametersDto,
  ) {
    return this.catalogService.replaceParameters(
      user.tenantId,
      id,
      dto.parameters,
    );
  }

  // ----- Packages -----

  @Get('packages')
  @RequirePermissions(Permission.CATALOG_VIEW)
  async listPackages(
    @CurrentUser() user: AuthUser,
    @Query('all') all?: string,
  ) {
    return this.catalogService.listPackages(user.tenantId, all !== 'true');
  }

  @Get('packages/:id')
  @RequirePermissions(Permission.CATALOG_VIEW)
  async getPackage(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.catalogService.getPackage(user.tenantId, id);
  }

  @Post('packages')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.CATALOG_MANAGE)
  async createPackage(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePackageDto,
  ) {
    return this.catalogService.createPackage(user.tenantId, dto);
  }
}
