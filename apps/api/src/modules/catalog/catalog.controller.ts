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
  UseGuards,
} from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CreateTestDto, ReplaceTestParametersDto } from './dto/create-test.dto';
import { CreatePackageDto } from './dto/create-package.dto';
import { SessionGuard } from '../../common/guards/session.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('catalog')
@UseGuards(SessionGuard)
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  // ----- Tests -----

  @Get('tests')
  async listTests(
    @CurrentUser() user: AuthUser,
    @Query('all') all?: string,
  ) {
    return this.catalogService.listTests(user.tenantId, all !== 'true');
  }

  @Get('tests/:id')
  async getTest(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.catalogService.getTest(user.tenantId, id);
  }

  @Post('tests')
  @HttpCode(HttpStatus.CREATED)
  async createTest(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTestDto,
  ) {
    return this.catalogService.createTest(user.tenantId, dto);
  }

  @Patch('tests/:id')
  async updateTest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<CreateTestDto>,
  ) {
    return this.catalogService.updateTest(user.tenantId, id, dto);
  }

  @Patch('tests/:id/parameters')
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
  async listPackages(
    @CurrentUser() user: AuthUser,
    @Query('all') all?: string,
  ) {
    return this.catalogService.listPackages(user.tenantId, all !== 'true');
  }

  @Get('packages/:id')
  async getPackage(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.catalogService.getPackage(user.tenantId, id);
  }

  @Post('packages')
  @HttpCode(HttpStatus.CREATED)
  async createPackage(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePackageDto,
  ) {
    return this.catalogService.createPackage(user.tenantId, dto);
  }
}
