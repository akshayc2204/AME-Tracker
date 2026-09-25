import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return users.map((u) => this.toDto(u))
  }

  async create(data: {
    email: string
    password: string
    fullName?: string
    name?: string
    role?: string
  }) {
    const email = data.email.trim()
    const taken = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    })
    if (taken) {
      throw new ConflictException({
        errorCode: 'EMAIL_IN_USE',
        message: 'That username is already used by another account',
      })
    }

    const passwordHash = await bcrypt.hash(data.password, 10)
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name: (data.name || data.fullName || 'User').trim(),
        role: data.role || 'ADMIN',
        isActive: 1,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    })
    return this.toDto(user)
  }

  async update(
    id: number,
    data: {
      fullName?: string
      name?: string
      email?: string
      newPassword?: string
      password?: string
      role?: string
      isActive?: number
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } })
    if (!user) {
      throw new NotFoundException({
        errorCode: 'USER_NOT_FOUND',
        message: 'User not found',
      })
    }

    const nextName = (data.fullName ?? data.name)?.trim()
    const nextEmail = data.email?.trim()
    const nextPassword = data.newPassword ?? data.password
    const patch: {
      name?: string
      email?: string
      passwordHash?: string
      role?: string
      isActive?: number
    } = {}

    if (nextName) {
      if (nextName.length < 2) {
        throw new BadRequestException({
          errorCode: 'NAME_TOO_SHORT',
          message: 'Name must be at least 2 characters',
        })
      }
      patch.name = nextName
    }

    if (nextEmail && nextEmail !== user.email) {
      const taken = await this.prisma.user.findFirst({
        where: { email: { equals: nextEmail, mode: 'insensitive' } },
        select: { id: true },
      })
      if (taken && taken.id !== id) {
        throw new ConflictException({
          errorCode: 'EMAIL_IN_USE',
          message: 'That username is already used by another account',
        })
      }
      patch.email = nextEmail
    }

    if (nextPassword) {
      if (nextPassword.length < 6) {
        throw new BadRequestException({
          errorCode: 'PASSWORD_TOO_SHORT',
          message: 'Password must be at least 6 characters',
        })
      }
      patch.passwordHash = await bcrypt.hash(nextPassword, 10)
    }

    if (data.role?.trim()) {
      patch.role = data.role.trim().toUpperCase()
    }

    if (data.isActive === 0 || data.isActive === 1) {
      patch.isActive = data.isActive
    }

    if (
      !patch.name &&
      !patch.email &&
      !patch.passwordHash &&
      !patch.role &&
      patch.isActive === undefined
    ) {
      throw new BadRequestException({
        errorCode: 'NOTHING_TO_UPDATE',
        message: 'Enter a new name, username, or password to save',
      })
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: patch,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    })
    return this.toDto(updated)
  }

  private toDto(user: {
    id: number
    email: string
    name: string
    role: string
    isActive: number
    createdAt: Date
  }) {
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
}
