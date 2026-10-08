import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { memberships, users } from '../db/schema.js';

/**
 * Возвращает telegram_id всех участников household.
 * Используется для рассылки уведомлений.
 */
export function getHouseholdTelegramIds(householdId: number): number[] {
  return db
    .select({ telegramId: users.telegramId })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.householdId, householdId))
    .all()
    .map((r) => r.telegramId);
}
