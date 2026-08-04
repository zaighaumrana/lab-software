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
import { DoctorsService } from './doctors.service';
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
