import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { AuthService } from './auth.service'
import { LoginDto, LogoutDto, RefreshDto } from './dto/login.dto'
import { ok } from '../common/dto/api-response'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator'

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    const data = await this.authService.login(dto)
    return ok(data, 'Logged in successfully')
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshDto) {
    const data = await this.authService.refresh(dto.refreshToken)
    return ok(data, 'Token refreshed')
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@CurrentUser() user: AuthUser, @Body() dto: LogoutDto) {
    const data = await this.authService.logout(dto.refreshToken, user.id)
    return ok(data, 'Logged out')
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const data = await this.authService.me(user.id)
    return ok(data)
  }
}
