import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { categories, transactions, type Category } from '../db/schema.js';
import { CATEGORY_NAME_MAX_LENGTH } from '../domain/constants.js';
import {
  CategoryHasTransactionsError,
  ConflictError,
  InsufficientFundsError,
  NotFoundError,
  PeriodArchivedError,
  ValidationError,
} from '../domain/errors.js';
import type { CategoryWithStats } from '../domain/types.js';
import { getPeriodById, getSystemCategory } from './budget-period.service.js';

// ---------------------------------------------------------------------------
// Чтение
// ---------------------------------------------------------------------------

export function getCategoryById(id: number): Category | null {
  return db.select().from(categories).where(eq(categories.id, id)).get() ?? null;
}

export function listCategories(periodId: number): Category[] {
  return db
    .select()
    .from(categories)
    .where(eq(categories.budgetPeriodId, periodId))
    .orderBy(asc(categories.sortOrder), asc(categories.id))
    .all();
}

/**
 * Список категорий с фактическими тратами и остатками.
 * Сортировка: системная («Свободные средства») — последней,
 * остальные — по sortOrder.
 */
export function listCategoriesWithStats(periodId: number): CategoryWithStats[] {
  const rows = db
    .select({
      id: categories.id,
      name: categories.name,
      limitAmount: categories.limitAmount,
      isSystem: categories.isSystem,
      isArchived: categories.isArchived,
      sortOrder: categories.sortOrder,
      spent: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(categories)
    .leftJoin(transactions, eq(transactions.categoryId, categories.id))
    .where(eq(categories.budgetPeriodId, periodId))
    .groupBy(categories.id)
    .all();

  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      limitAmount: r.limitAmount,
      isSystem: r.isSystem,
      isArchived: r.isArchived,
      sortOrder: r.sortOrder,
      spent: r.spent,
      remaining: r.limitAmount - r.spent,
    }))
    .sort((a, b) => {
      if (a.isSystem !== b.isSystem) return a.isSystem ? 1 : -1;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.id - b.id;
    });
}

// ---------------------------------------------------------------------------
// Создание
// ---------------------------------------------------------------------------

function validateName(rawName: string): string {
  const name = rawName.trim();
  if (!name) throw new ValidationError('Название категории не может быть пустым');
  if (name.length > CATEGORY_NAME_MAX_LENGTH) {
    throw new ValidationError(`Название длиннее ${CATEGORY_NAME_MAX_LENGTH} символов`);
  }
  return name;
}

/**
 * Создаёт обычную (не системную) категорию в активном периоде.
 * Проверяет, что лимит ≤ свободных средств.
 * После создания пересчитывает лимит системной категории.
 */
export function createCategory(periodId: number, rawName: string, limitAmount: number): Category {
  const name = validateName(rawName);

  if (!Number.isSafeInteger(limitAmount) || limitAmount < 0) {
    throw new ValidationError('Некорректный лимит категории');
  }

  const period = getPeriodById(periodId);
  if (!period) throw new NotFoundError('BudgetPeriod', periodId);
  if (period.status !== 'active') throw new PeriodArchivedError();

  // Дубликат имени (case-insensitive) — не разрешаем.
  const duplicate = db
    .select()
    .from(categories)
    .where(
      and(eq(categories.budgetPeriodId, periodId), sql`LOWER(${categories.name}) = LOWER(${name})`),
    )
    .get();
  if (duplicate) {
    throw new ConflictError(`Категория «${name}» уже существует`);
  }

  const free = getSystemCategory(periodId);
  if (!free) throw new NotFoundError('System category for period', periodId);

  if (limitAmount > free.limitAmount) {
    throw new InsufficientFundsError(free.limitAmount, limitAmount);
  }

  const maxSort = db
    .select({ max: sql<number>`COALESCE(MAX(${categories.sortOrder}), 0)` })
    .from(categories)
    .where(eq(categories.budgetPeriodId, periodId))
    .get();

  const nextSort = (maxSort?.max ?? 0) + 1;

  return db.transaction((tx) => {
    const category = tx
      .insert(categories)
      .values({
        budgetPeriodId: periodId,
        name,
        limitAmount,
        isSystem: false,
        sortOrder: nextSort,
      })
      .returning()
      .get();

    tx.update(categories)
      .set({ limitAmount: free.limitAmount - limitAmount })
      .where(eq(categories.id, free.id))
      .run();

    return category;
  });
}

// ---------------------------------------------------------------------------
// Изменение лимита
// ---------------------------------------------------------------------------

export type LimitChangeResult = {
  category: Category;
  /** Факт по категории на момент изменения. */
  spent: number;
  /** Новый остаток (может быть отрицательным). */
  remaining: number;
};

/**
 * Меняет лимит обычной категории.
 * Увеличение ограничено свободными средствами.
 * Уменьшение разрешено всегда (с предупреждением на стороне бота, если spent > newLimit).
 * Системную категорию менять нельзя.
 */
export function updateCategoryLimit(categoryId: number, newLimit: number): LimitChangeResult {
  if (!Number.isSafeInteger(newLimit) || newLimit < 0) {
    throw new ValidationError('Некорректный лимит категории');
  }

  const category = getCategoryById(categoryId);
  if (!category) throw new NotFoundError('Category', categoryId);
  if (category.isSystem) {
    throw new ValidationError('Лимит системной категории менять нельзя');
  }

  const period = getPeriodById(category.budgetPeriodId);
  if (!period) throw new NotFoundError('BudgetPeriod', category.budgetPeriodId);
  if (period.status !== 'active') throw new PeriodArchivedError();

  const delta = newLimit - category.limitAmount;

  const free = getSystemCategory(category.budgetPeriodId);
  if (!free) throw new NotFoundError('System category for period', category.budgetPeriodId);

  if (delta > free.limitAmount) {
    throw new InsufficientFundsError(free.limitAmount, delta);
  }

  const updated = db.transaction((tx) => {
    const cat = tx
      .update(categories)
      .set({ limitAmount: newLimit })
      .where(eq(categories.id, categoryId))
      .returning()
      .get();

    tx.update(categories)
      .set({ limitAmount: free.limitAmount - delta })
      .where(eq(categories.id, free.id))
      .run();

    return cat;
  });

  const spentRow = db
    .select({ sum: sql<number>`COALESCE(SUM(${transactions.amount}), 0)` })
    .from(transactions)
    .where(eq(transactions.categoryId, categoryId))
    .get();

  const spent = spentRow?.sum ?? 0;

  return {
    category: updated,
    spent,
    remaining: newLimit - spent,
  };
}

// ---------------------------------------------------------------------------
// Архивация / удаление
// ---------------------------------------------------------------------------

/**
 * Архивирует категорию. Транзакции остаются, категория пропадает
 * из списков для создания новых трат, но в отчётах остаётся видимой.
 */
export function archiveCategory(categoryId: number): Category {
  const category = getCategoryById(categoryId);
  if (!category) throw new NotFoundError('Category', categoryId);
  if (category.isSystem) {
    throw new ValidationError('Системную категорию нельзя архивировать');
  }

  const period = getPeriodById(category.budgetPeriodId);
  if (!period) throw new NotFoundError('BudgetPeriod', category.budgetPeriodId);
  if (period.status !== 'active') throw new PeriodArchivedError();

  return db
    .update(categories)
    .set({ isArchived: true })
    .where(eq(categories.id, categoryId))
    .returning()
    .get();
}

/**
 * Удаляет категорию, если в ней нет транзакций.
 * Сумму лимита возвращает в свободные средства.
 * Системную категорию удалять нельзя.
 */
export function deleteCategory(categoryId: number): void {
  const category = getCategoryById(categoryId);
  if (!category) throw new NotFoundError('Category', categoryId);
  if (category.isSystem) {
    throw new ValidationError('Системную категорию нельзя удалить');
  }

  const period = getPeriodById(category.budgetPeriodId);
  if (!period) throw new NotFoundError('BudgetPeriod', category.budgetPeriodId);
  if (period.status !== 'active') throw new PeriodArchivedError();

  const txCount = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(transactions)
    .where(eq(transactions.categoryId, categoryId))
    .get();

  if ((txCount?.count ?? 0) > 0) {
    throw new CategoryHasTransactionsError();
  }

  const free = getSystemCategory(category.budgetPeriodId);
  if (!free) throw new NotFoundError('System category for period', category.budgetPeriodId);

  db.transaction((tx) => {
    tx.delete(categories).where(eq(categories.id, categoryId)).run();
    tx.update(categories)
      .set({ limitAmount: free.limitAmount + category.limitAmount })
      .where(eq(categories.id, free.id))
      .run();
  });
}
