import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { LoginDto } from './dto/login.dto'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    })
    if (!user || user.isActive !== 1) {
      throw new UnauthorizedException({
        errorCode: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      })
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash)
    if (!valid) {
      throw new UnauthorizedException({
        errorCode: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      })
    }

    const tokens = await this.issueTokens(user.id, user.email, user.role)
    await this.audit.log({
      userId: user.id,
      action: 'AUTH_LOGIN',
      entityType: 'User',
      entityId: String(user.id),
    })

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.name,
        name: user.name,
        role: user.role,
      },
    }
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: number; email: string; role: string }>(
        refreshToken,
        { secret: this.config.getOrThrow<string>('JWT_SECRET') },
      )
      const user = await this.prisma.user.findUnique({
        where: { id: Number(payload.sub) },
      })
      if (!user || user.isActive !== 1) {
        throw new UnauthorizedException({
          errorCode: 'INVALID_REFRESH_TOKEN',
          message: 'User session is invalid or inactive',
        })
      }
      return this.issueTokens(user.id, user.email, user.role)
    } catch {
      throw new UnauthorizedException({
        errorCode: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid or expired',
      })
    }
  }

  async logout(refreshToken: string | undefined, userId: number) {
    await this.audit.log({
      userId,
      action: 'AUTH_LOGOUT',
      entityType: 'User',
      entityId: String(userId),
    })
    return { loggedOut: true }
  }

  async me(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    })
    if (!user) {
      throw new UnauthorizedException({
        errorCode: 'UNAUTHORIZED',
        message: 'User not found',
      })
    }
    return {
      id: user.id,
      email: user.email,
      fullName: user.name,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    }
  }

  private async issueTokens(
    userId: number,
    email: string,
    role: string,
  ) {
    const secret = this.config.getOrThrow<string>('JWT_SECRET')
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, role },
      {
        secret,
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m') as `${number}m`,
      },
    )

    const refreshToken = await this.jwt.signAsync(
      { sub: userId, email, role, type: 'refresh' },
      {
        secret,
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d') as `${number}d`,
      },
    )

    return { accessToken, refreshToken }
  }
}
