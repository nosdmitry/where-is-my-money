import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  budgetPeriods,
  categories,
  households,
  memberships,
  transactions,
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
 * Обнуляет все транзакции активного периода.
 * Категории, лимиты, участники, архив — остаются.
 */
export function resetCurrentPeriod(householdId: number, requestingUserId: number): number {
  const household = getHouseholdById(householdId);
  if (!household) throw new NotFoundError('Household', householdId);

  const membership = getMembershipByUserId(requestingUserId);
  if (!membership || membership.householdId !== householdId) {
    throw new PermissionError();
  }
  if (membership.role !== 'admin') {
    throw new PermissionError('Только администратор может сбросить месяц');
  }

  const active = db
    .select()
    .from(budgetPeriods)
    .where(and(eq(budgetPeriods.householdId, householdId), eq(budgetPeriods.status, 'active')))
    .get();

  if (!active) return 0;

  const result = db.delete(transactions).where(eq(transactions.budgetPeriodId, active.id)).run();

  return result.changes;
}

/**
 * Полностью удаляет household и все связанные данные.
 * Только владелец. Записи в users не удаляются.
 */
export function deleteHousehold(householdId: number, requestingUserId: number): void {
  const household = getHouseholdById(householdId);
  if (!household) throw new NotFoundError('Household', householdId);

  if (household.ownerUserId !== requestingUserId) {
    throw new PermissionError('Только владелец может удалить бюджет');
  }

  db.transaction((tx) => {
    const periodIds = tx
      .select({ id: budgetPeriods.id })
      .from(budgetPeriods)
      .where(eq(budgetPeriods.householdId, householdId))
      .all()
      .map((p) => p.id);

    if (periodIds.length > 0) {
      tx.delete(transactions).where(inArray(transactions.budgetPeriodId, periodIds)).run();
    }

    tx.delete(households).where(eq(households.id, householdId)).run();
  });
}

/**
 * Проверяет, пустой ли household.
 * Пустой = один участник, нет транзакций, нет несистемных категорий.
 */
export function isHouseholdEmpty(householdId: number): boolean {
  const members = getHouseholdMembers(householdId);
  if (members.length > 1) return false;

  const tx = db
    .select({ id: transactions.id })
    .from(transactions)
    .innerJoin(budgetPeriods, eq(budgetPeriods.id, transactions.budgetPeriodId))
    .where(eq(budgetPeriods.householdId, householdId))
    .limit(1)
    .get();
  if (tx) return false;

  const nonSystem = db
    .select({ id: categories.id })
    .from(categories)
    .innerJoin(budgetPeriods, eq(budgetPeriods.id, categories.budgetPeriodId))
    .where(and(eq(budgetPeriods.householdId, householdId), eq(categories.isSystem, false)))
    .limit(1)
    .get();
  if (nonSystem) return false;

  return true;
}

export function listActiveHouseholds(): Household[] {
  return db.select().from(households).where(eq(households.status, 'active')).all();
}
