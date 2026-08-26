import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { PrismaService } from '../prisma/prisma.service'
import type { AuthUser } from '../common/decorators/current-user.decorator'

interface JwtPayload {
  sub: number | string
  email: string
  role?: string
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    })
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const userId = Number(payload.sub)
    if (!userId || isNaN(userId)) {
      throw new UnauthorizedException({
        errorCode: 'UNAUTHORIZED',
        message: 'Invalid session token',
      })
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    })
    if (!user || user.isActive !== 1) {
      throw new UnauthorizedException({
        errorCode: 'UNAUTHORIZED',
        message: 'Invalid or inactive user session',
      })
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.name,
      name: user.name,
    }
  }
}
