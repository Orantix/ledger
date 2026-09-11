import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function generateTemporaryPassword(): string {
  // URL-safe, no ambiguous characters problem since it's shown once and
  // copy-pasted, not typed.
  return randomBytes(9).toString('base64url');
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Returns the temporary password once, in-band — there's no email
  // infrastructure here, so the admin is responsible for communicating it
  // to the new user out of band, who should change it on first login.
  async create(data: { email: string; name: string; role: Role }) {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new ConflictException(`A user with email ${data.email} already exists`);
    }
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const user = await this.prisma.user.create({
      data: { email: data.email, name: data.name, role: data.role, passwordHash },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });
    return { user, temporaryPassword };
  }

  update(id: string, data: { role?: Role; isActive?: boolean }) {
    return this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });
  }

  async resetPassword(id: string) {
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return { temporaryPassword };
  }
}
