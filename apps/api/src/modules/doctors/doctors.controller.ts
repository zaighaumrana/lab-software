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
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('doctors')
@UseGuards(SessionGuard)
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query('all') all?: string,
  ) {
    return this.doctorsService.list(user.tenantId, all !== 'true');
  }

  @Get(':id')
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.doctorsService.findById(user.tenantId, id);
  }

  @Get(':id/dashboard')
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
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateDoctorDto,
  ) {
    return this.doctorsService.create(user.tenantId, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<CreateDoctorDto>,
  ) {
    return this.doctorsService.update(user.tenantId, id, dto);
  }
}
