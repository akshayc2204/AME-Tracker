import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { ok } from '../common/dto/api-response'
import { DesktopService } from './desktop.service'
import {
  FabshopSettingsDto,
  PostgresSettingsDto,
  UpdateDesktopConfigDto,
} from './dto/update-desktop-config.dto'

/** Desktop setup must work even when PostgreSQL auth is wrong (chicken-and-egg). */
const desktopGuards = process.env.AME_DESKTOP === '1' ? [] : [JwtAuthGuard]

@Controller('api/desktop')
@UseGuards(...desktopGuards)
export class DesktopController {
  constructor(private readonly desktop: DesktopService) {}

  @Get('config')
  getConfig() {
    return ok(this.desktop.getConfig())
  }

  @Post('config')
  async save(@Body() body: UpdateDesktopConfigDto) {
    const data = await this.desktop.save(body)
    return ok(data, data.message)
  }

  @Post('test-postgres')
  async testPostgres(@Body() body: PostgresSettingsDto) {
    return ok(await this.desktop.testPostgres(body))
  }

  @Post('test-fabshop')
  async testFabshop(@Body() body: FabshopSettingsDto) {
    return ok(await this.desktop.testFabshop(body))
  }

  @Post('restart')
  restart() {
    const data = this.desktop.restart()
    return ok(data, data.message)
  }
}
