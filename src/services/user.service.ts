import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, type User } from '../db/schema.js';

export type TelegramUserData = {
  telegramId: number;
  username: string | null;
  firstName: string;
};

/**
 * Возвращает пользователя по telegramId.
 * Если не существует — создаёт.
 * Если существует, но username/firstName изменились — обновляет их.
 */
export function getOrCreateUser(data: TelegramUserData): User {
  const existing = db.select().from(users).where(eq(users.telegramId, data.telegramId)).get();

  if (existing) {
    const username = data.username ?? null;
    const firstName = data.firstName;

    if (existing.username !== username || existing.firstName !== firstName) {
      db.update(users).set({ username, firstName }).where(eq(users.id, existing.id)).run();
      return { ...existing, username, firstName };
    }

    return existing;
  }

  return db
    .insert(users)
    .values({
      telegramId: data.telegramId,
      username: data.username ?? null,
      firstName: data.firstName,
    })
    .returning()
    .get();
}

export function getUserById(id: number): User | null {
  return db.select().from(users).where(eq(users.id, id)).get() ?? null;
}

export function getUserByTelegramId(telegramId: number): User | null {
  return db.select().from(users).where(eq(users.telegramId, telegramId)).get() ?? null;
}
