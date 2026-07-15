import type { UserRole } from '@jovandyaz/auth';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike } from 'drizzle-orm';

import {
  DATABASE_CONNECTION,
  users,
  type Database,
  type NewUser,
} from '../../database';
import { escapeLike } from '../../database/escape-like';
import type { UserReadRepository } from './domain/ports/user-read.repository';

@Injectable()
export class UsersRepository implements UserReadRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database
  ) {}

  async findById(id: string) {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return result[0] ?? null;
  }

  async findByEmail(email: string) {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return result[0] ?? null;
  }

  async findByProviderAndProviderId(provider: string, providerId: string) {
    const result = await this.db
      .select()
      .from(users)
      .where(
        and(eq(users.provider, provider), eq(users.providerId, providerId))
      )
      .limit(1);

    return result[0] ?? null;
  }

  async create(data: NewUser) {
    const result = await this.db.insert(users).values(data).returning();
    return result[0];
  }

  async update(id: string, data: Partial<NewUser>) {
    const result = await this.db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    return result[0] ?? null;
  }

  async delete(id: string) {
    const result = await this.db
      .delete(users)
      .where(eq(users.id, id))
      .returning();

    return result[0] ?? null;
  }

  async findPage(params: {
    page: number;
    limit: number;
    search?: string | undefined;
  }) {
    const { page, limit, search } = params;
    const filters = [eq(users.isAnonymous, false)];
    if (search) {
      filters.push(ilike(users.email, `%${escapeLike(search)}%`));
    }
    const where = and(...filters);

    const [items, totalResult] = await Promise.all([
      this.db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          avatarUrl: users.avatarUrl,
          role: users.role,
          provider: users.provider,
          isAnonymous: users.isAnonymous,
          createdAt: users.createdAt,
          emailVerifiedAt: users.emailVerifiedAt,
        })
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db.select({ value: count() }).from(users).where(where),
    ]);

    return { items, total: totalResult[0]?.value ?? 0 };
  }

  async updateRole(id: string, role: UserRole) {
    const result = await this.db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
        role: users.role,
        provider: users.provider,
        isAnonymous: users.isAnonymous,
        createdAt: users.createdAt,
        emailVerifiedAt: users.emailVerifiedAt,
      });

    return result[0] ?? null;
  }
}
