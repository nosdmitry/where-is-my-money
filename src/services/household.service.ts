import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  budgetPeriods,
  categories,
  households,
  memberships,
  type BudgetPeriod,
  type Household,
  type Membership,
} from '../db/schema.js';
import { FREE_CATEGORY_NAME } from '../domain/constants.js';
import { ConflictError, NotFoundError, PermissionError } from '../domain/errors.js';
import { currentPeriodKey } from '../utils/date.js';

export type CreatedHousehold = {
  household: Household;
  membership: Membership;
  period: BudgetPeriod;
};

export type HouseholdContext = {
  household: Household;
  membership: Membership;
  activePeriod: BudgetPeriod;
};

/**
 * Создаёт household, membership admin и первый активный период.
 * Внутри периода сразу создаётся системная категория «Свободные средства»
 * с лимитом, равным totalLimit.
 */
export function createHousehold(
  userId: number,
  totalLimit: number,
  timezone: string,
): CreatedHousehold {
  const existing = db.select().from(memberships).where(eq(memberships.userId, userId)).get();

  if (existing) {
    throw new ConflictError('Пользователь уже участвует в бюджете');
  }

  const key = currentPeriodKey(timezone);

  return db.transaction((tx) => {
    const household = tx
      .insert(households)
      .values({ ownerUserId: userId, timezone })
      .returning()
      .get();

    const membership = tx
      .insert(memberships)
      .values({
        userId,
        householdId: household.id,
        role: 'admin',
      })
      .returning()
      .get();

    const period = tx
      .insert(budgetPeriods)
      .values({
        householdId: household.id,
        year: key.year,
        month: key.month,
        totalLimit,
        status: 'active',
      })
      .returning()
      .get();

    tx.insert(categories)
      .values({
        budgetPeriodId: period.id,
        name: FREE_CATEGORY_NAME,
        limitAmount: totalLimit,
        isSystem: true,
        sortOrder: 0,
      })
      .run();

    return { household, membership, period };
  });
}

export function getHouseholdById(id: number): Household | null {
  return db.select().from(households).where(eq(households.id, id)).get() ?? null;
}

export function getMembershipByUserId(userId: number): Membership | null {
  return db.select().from(memberships).where(eq(memberships.userId, userId)).get() ?? null;
}

export function getHouseholdMembers(householdId: number): Membership[] {
  return db.select().from(memberships).where(eq(memberships.householdId, householdId)).all();
}

/**
 * Возвращает полный контекст пользователя: household, membership и активный период.
 * Если пользователь не в household, или нет активного периода — null.
 */
export function getContextByUserId(userId: number): HouseholdContext | null {
  const membership = getMembershipByUserId(userId);
  if (!membership) return null;

  const household = getHouseholdById(membership.householdId);
  if (!household || household.status !== 'active') return null;

  const activePeriod = db
    .select()
    .from(budgetPeriods)
    .where(and(eq(budgetPeriods.householdId, household.id), eq(budgetPeriods.status, 'active')))
    .get();

  if (!activePeriod) return null;

  return { household, membership, activePeriod };
}

/**
 * Помечает household как закрытый. Ставит deleted_at = now().
 * Только owner может закрыть.
 * Hard delete произойдёт через HOUSEHOLD_HARD_DELETE_DAYS дней (cron, шаг позже).
 */
export function closeHousehold(householdId: number, requestingUserId: number): void {
  const household = getHouseholdById(householdId);
  if (!household) throw new NotFoundError('Household', householdId);

  if (household.ownerUserId !== requestingUserId) {
    throw new PermissionError('Только владелец может закрыть бюджет');
  }

  if (household.status === 'closed') return;

  db.update(households)
    .set({ status: 'closed', deletedAt: new Date() })
    .where(eq(households.id, householdId))
    .run();
}

/**
 * Проверяет, пустой ли household.
 * Пустой = одна системная категория во всех периодах, нет транзакций,
 * и только один участник.
 * Используется при инвайтах: если у приглашённого есть пустой household — его можно перетереть.
 */
export function isHouseholdEmpty(householdId: number): boolean {
  const memberships_ = getHouseholdMembers(householdId);
  if (memberships_.length > 1) return false;

  const periods = db
    .select()
    .from(budgetPeriods)
    .where(eq(budgetPeriods.householdId, householdId))
    .all();

  // Проверим, что во всех периодах только системная категория
  for (const period of periods) {
    const cats = db.select().from(categories).where(eq(categories.budgetPeriodId, period.id)).all();
    if (cats.length > 1) return false;
    if (cats.length === 1 && !cats[0]!.isSystem) return false;
  }

  // Транзакции
  const hasTransactions = periods.some((p) => {
    const row = db
      .select({ id: budgetPeriods.id })
      .from(budgetPeriods)
      .where(eq(budgetPeriods.id, p.id))
      .get();
    return row === undefined;
  });
  if (hasTransactions) return false;

  return true;
}
