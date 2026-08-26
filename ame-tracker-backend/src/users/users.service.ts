import { Injectable } from '@nestjs/common'
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
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.name,
      name: u.name,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
    }))
  }

  async create(data: {
    email: string
    password: string
    fullName?: string
    name?: string
    role?: string
  }) {
    const passwordHash = await bcrypt.hash(data.password, 10)
    const user = await this.prisma.user.create({
      data: {
        email: data.email.toLowerCase().trim(),
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
