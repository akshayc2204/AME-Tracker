import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { IsOptional, IsString, MinLength } from 'class-validator'
import { ClientsService } from './clients.service'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { ok } from '../common/dto/api-response'

class CreateClientDto {
  @IsString()
  @MinLength(2)
  name!: string

  @IsOptional()
  @IsString()
  accountNumber?: string

  @IsOptional()
  @IsString()
  notes?: string
}

@Controller('api/clients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @Roles('ADMIN', 'OPERATOR')
  async list(@Query('search') search?: string) {
    return ok(await this.clientsService.list(search))
  }

  @Get(':id')
  @Roles('ADMIN', 'OPERATOR')
  async get(@Param('id') id: string) {
    return ok(await this.clientsService.get(id))
  }

  @Post()
  @Roles('ADMIN')
  async create(@Body() dto: CreateClientDto) {
    return ok(await this.clientsService.create(dto), 'Client created')
  }
}
