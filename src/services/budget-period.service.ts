import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { budgetPeriods, categories, type BudgetPeriod, type Category } from '../db/schema.js';
import { FREE_CATEGORY_NAME } from '../domain/constants.js';
import {
  ConflictError,
  InsufficientFundsError,
  NotFoundError,
  PeriodArchivedError,
  ValidationError,
} from '../domain/errors.js';
import type { PeriodKey } from '../domain/types.js';
import { currentPeriodKey } from '../utils/date.js';

// ---------------------------------------------------------------------------
// Чтение
// ---------------------------------------------------------------------------

export function getPeriodById(id: number): BudgetPeriod | null {
  return db.select().from(budgetPeriods).where(eq(budgetPeriods.id, id)).get() ?? null;
}

export function getActivePeriod(householdId: number): BudgetPeriod | null {
  return (
    db
      .select()
      .from(budgetPeriods)
      .where(and(eq(budgetPeriods.householdId, householdId), eq(budgetPeriods.status, 'active')))
      .get() ?? null
  );
}

export function getPeriodByKey(householdId: number, key: PeriodKey): BudgetPeriod | null {
  return (
    db
      .select()
      .from(budgetPeriods)
      .where(
        and(
          eq(budgetPeriods.householdId, householdId),
          eq(budgetPeriods.year, key.year),
          eq(budgetPeriods.month, key.month),
        ),
      )
      .get() ?? null
  );
}

export function listPeriods(householdId: number): BudgetPeriod[] {
  return db
    .select()
    .from(budgetPeriods)
    .where(eq(budgetPeriods.householdId, householdId))
    .orderBy(sql`${budgetPeriods.year} DESC, ${budgetPeriods.month} DESC`)
    .all();
}

// ---------------------------------------------------------------------------
// Хелперы
// ---------------------------------------------------------------------------

function assertActive(period: BudgetPeriod): void {
  if (period.status !== 'active') {
    throw new PeriodArchivedError();
  }
}

export function getSystemCategory(periodId: number): Category | null {
  return (
    db
      .select()
      .from(categories)
      .where(and(eq(categories.budgetPeriodId, periodId), eq(categories.isSystem, true)))
      .get() ?? null
  );
}

export function getNonSystemCategoriesSum(periodId: number): number {
  const row = db
    .select({ sum: sql<number>`COALESCE(SUM(${categories.limitAmount}), 0)` })
    .from(categories)
    .where(and(eq(categories.budgetPeriodId, periodId), eq(categories.isSystem, false)))
    .get();
  return row?.sum ?? 0;
}

/**
 * Пересчитывает лимит системной категории как total_limit - сумма обычных лимитов.
 * Вызывать после любого изменения лимитов обычных категорий.
 */
export function recalculateFreeCategory(periodId: number): void {
  const period = getPeriodById(periodId);
  if (!period) throw new NotFoundError('BudgetPeriod', periodId);

  const free = getSystemCategory(periodId);
  if (!free) throw new NotFoundError('System category for period', periodId);

  const newLimit = period.totalLimit - getNonSystemCategoriesSum(periodId);

  db.update(categories).set({ limitAmount: newLimit }).where(eq(categories.id, free.id)).run();
}

// ---------------------------------------------------------------------------
// Создание периода
// ---------------------------------------------------------------------------

/**
 * Создаёт новый активный период в рамках уже существующего household.
 * Создаёт системную категорию с лимитом = totalLimit.
 * Если период с таким ключом уже существует — конфликт.
 */
export function createPeriod(
  householdId: number,
  key: PeriodKey,
  totalLimit: number,
): BudgetPeriod {
  const existing = getPeriodByKey(householdId, key);
  if (existing) {
    throw new ConflictError(`Период ${key.year}-${key.month} уже существует`);
  }

  return db.transaction((tx) => {
    const period = tx
      .insert(budgetPeriods)
      .values({
        householdId,
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

    return period;
  });
}

// ---------------------------------------------------------------------------
// Переход месяца
// ---------------------------------------------------------------------------

export type MonthTransitionResult = {
  created: boolean;
  period: BudgetPeriod | null;
  /** Архивный период, если был переход. */
  archivedPeriodId: number | null;
};

/**
 * Проверяет, наступил ли новый месяц. Если да:
 * 1. Архивирует текущий активный период.
 * 2. Создаёт новый период с копией total_limit.
 * 3. Клонирует обычные категории с их лимитами.
 * 4. Создаёт системную категорию с лимитом = total_limit - сумма обычных.
 *
 * Если активного периода нет — ничего не делает.
 * Если период на текущий месяц уже есть — ничего не делает.
 */
export function transitionToCurrentMonth(
  householdId: number,
  timezone: string,
): MonthTransitionResult {
  const key = currentPeriodKey(timezone);
  const existing = getPeriodByKey(householdId, key);
  if (existing) {
    return { created: false, period: existing, archivedPeriodId: null };
  }

  const active = getActivePeriod(householdId);
  if (!active) {
    return { created: false, period: null, archivedPeriodId: null };
  }

  return db.transaction((tx) => {
    tx.update(budgetPeriods)
      .set({ status: 'archived' })
      .where(eq(budgetPeriods.id, active.id))
      .run();

    const newPeriod = tx
      .insert(budgetPeriods)
      .values({
        householdId,
        year: key.year,
        month: key.month,
        totalLimit: active.totalLimit,
        status: 'active',
      })
      .returning()
      .get();

    const oldCategories = tx
      .select()
      .from(categories)
      .where(and(eq(categories.budgetPeriodId, active.id), eq(categories.isSystem, false)))
      .all();

    let sumLimits = 0;
    for (const cat of oldCategories) {
      tx.insert(categories)
        .values({
          budgetPeriodId: newPeriod.id,
          name: cat.name,
          limitAmount: cat.limitAmount,
          isSystem: false,
          isArchived: false,
          sortOrder: cat.sortOrder,
        })
        .run();
      sumLimits += cat.limitAmount;
    }

    tx.insert(categories)
      .values({
        budgetPeriodId: newPeriod.id,
        name: FREE_CATEGORY_NAME,
        limitAmount: newPeriod.totalLimit - sumLimits,
        isSystem: true,
        sortOrder: 0,
      })
      .run();

    return {
      created: true,
      period: newPeriod,
      archivedPeriodId: active.id,
    };
  });
}

// ---------------------------------------------------------------------------
// Обновление лимита
// ---------------------------------------------------------------------------

/**
 * Обновляет общий лимит активного периода.
 * Запрещает уменьшение ниже суммы обычных лимитов.
 * Пересчитывает свободную категорию.
 */
export function updateTotalLimit(periodId: number, newLimit: number): void {
  if (!Number.isSafeInteger(newLimit) || newLimit <= 0) {
    throw new ValidationError('Некорректная сумма лимита');
  }

  const period = getPeriodById(periodId);
  if (!period) throw new NotFoundError('BudgetPeriod', periodId);
  assertActive(period);

  const sumCategories = getNonSystemCategoriesSum(periodId);
  if (newLimit < sumCategories) {
    throw new InsufficientFundsError(sumCategories, newLimit);
  }

  db.transaction((tx) => {
    tx.update(budgetPeriods)
      .set({ totalLimit: newLimit })
      .where(eq(budgetPeriods.id, periodId))
      .run();

    const free = getSystemCategory(periodId);
    if (!free) throw new NotFoundError('System category for period', periodId);

    tx.update(categories)
      .set({ limitAmount: newLimit - sumCategories })
      .where(eq(categories.id, free.id))
      .run();
  });
}

// ---------------------------------------------------------------------------
// Проверка инвариантов (для тестов и дебага)
// ---------------------------------------------------------------------------

/**
 * Инвариант: в активном периоде ровно одна системная категория,
 * и её лимит равен totalLimit - сумма остальных.
 */
export function assertPeriodConsistency(periodId: number): void {
  const period = getPeriodById(periodId);
  if (!period) throw new NotFoundError('BudgetPeriod', periodId);

  const systemCount = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(categories)
    .where(and(eq(categories.budgetPeriodId, periodId), eq(categories.isSystem, true)))
    .get();
  if (systemCount?.count !== 1) {
    throw new Error(`Period ${periodId}: expected 1 system category, got ${systemCount?.count}`);
  }
  // Остальные проверки можно добавить позже.
}
