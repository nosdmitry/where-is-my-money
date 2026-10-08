import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { categories, memberships, transactions, users, type Transaction } from '../db/schema.js';
import { COMMENT_MAX_LENGTH, MAX_TRANSACTION_AMOUNT } from '../domain/constants.js';
import {
  NotFoundError,
  PeriodArchivedError,
  PermissionError,
  ValidationError,
} from '../domain/errors.js';
import type { MemberSpending } from '../domain/types.js';
import { formatDateTimeShort, isDateInPeriod } from '../utils/date.js';
import { getCategoryById } from './category.service.js';
import { getPeriodById } from './budget-period.service.js';
import { getHouseholdById, getMembershipByUserId } from './household.service.js';

// ---------------------------------------------------------------------------
// Чтение
// ---------------------------------------------------------------------------

export function getTransactionById(id: number): Transaction | null {
  return db.select().from(transactions).where(eq(transactions.id, id)).get() ?? null;
}

export type ListTransactionsOptions = {
  limit?: number;
  offset?: number;
};

export function listTransactions(
  periodId: number,
  options: ListTransactionsOptions = {},
): Transaction[] {
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;

  return db
    .select()
    .from(transactions)
    .where(eq(transactions.budgetPeriodId, periodId))
    .orderBy(desc(transactions.spentAt), desc(transactions.id))
    .limit(limit)
    .offset(offset)
    .all();
}

export function countTransactions(periodId: number): number {
  const row = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(transactions)
    .where(eq(transactions.budgetPeriodId, periodId))
    .get();
  return row?.count ?? 0;
}

export function getCategorySpent(categoryId: number): number {
  const row = db
    .select({ sum: sql<number>`COALESCE(SUM(${transactions.amount}), 0)` })
    .from(transactions)
    .where(eq(transactions.categoryId, categoryId))
    .get();
  return row?.sum ?? 0;
}

export function getPeriodSpent(periodId: number): number {
  const row = db
    .select({ sum: sql<number>`COALESCE(SUM(${transactions.amount}), 0)` })
    .from(transactions)
    .where(eq(transactions.budgetPeriodId, periodId))
    .get();
  return row?.sum ?? 0;
}

/**
 * Разбивка трат по участникам household за период.
 * Возвращает только тех, кто что-то потратил.
 */
export function getSpendingByAuthor(periodId: number): MemberSpending[] {
  return db
    .select({
      membershipId: memberships.id,
      firstName: users.firstName,
      username: users.username,
      spent: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .innerJoin(memberships, eq(memberships.id, transactions.authorMembershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(transactions.budgetPeriodId, periodId))
    .groupBy(memberships.id, users.firstName, users.username)
    .all()
    .map((r) => ({
      membershipId: r.membershipId,
      displayName: r.username ? `@${r.username}` : r.firstName,
      spent: r.spent,
    }));
}

/**
 * Топ-N крупнейших трат периода.
 */
export function getTopTransactions(periodId: number, n: number = 5): Transaction[] {
  return db
    .select()
    .from(transactions)
    .where(eq(transactions.budgetPeriodId, periodId))
    .orderBy(desc(transactions.amount))
    .limit(n)
    .all();
}

// ---------------------------------------------------------------------------
// Создание
// ---------------------------------------------------------------------------

export type CreateTransactionInput = {
  periodId: number;
  categoryId: number;
  authorMembershipId: number;
  amount: number;
  comment: string | null;
  spentAt: Date;
};

export type CreateTransactionResult = {
  transaction: Transaction;
  /** Сколько потрачено в категории после этой транзакции. */
  categorySpentAfter: number;
  /** Лимит категории. */
  categoryLimit: number;
  /** Остаток в категории после транзакции (может быть отрицательным). */
  categoryRemainingAfter: number;
  /** Флаг: только что исчерпали лимит (было < limit, стало >= limit). */
  limitJustExhausted: boolean;
  /** Флаг: только что ушли в минус (было <= limit, стало > limit). */
  wentNegative: boolean;
};

/**
 * Создаёт транзакцию. Все проверки — на уровне приложения.
 * Не блокирует превышение лимита — только сообщает флагами.
 */
export function createTransaction(input: CreateTransactionInput): CreateTransactionResult {
  const { periodId, categoryId, authorMembershipId, amount, spentAt } = input;

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new ValidationError('Сумма должна быть целым положительным числом');
  }
  if (amount > MAX_TRANSACTION_AMOUNT) {
    throw new ValidationError(
      `Сумма больше допустимого максимума (${MAX_TRANSACTION_AMOUNT.toLocaleString('ru-RU')} ₽)`,
    );
  }

  const comment = input.comment?.trim() ?? null;
  if (comment && comment.length > COMMENT_MAX_LENGTH) {
    throw new ValidationError(`Комментарий длиннее ${COMMENT_MAX_LENGTH} символов`);
  }

  const period = getPeriodById(periodId);
  if (!period) throw new NotFoundError('BudgetPeriod', periodId);
  if (period.status !== 'active') throw new PeriodArchivedError();

  const category = getCategoryById(categoryId);
  if (!category) throw new NotFoundError('Category', categoryId);
  if (category.budgetPeriodId !== periodId) {
    throw new ValidationError('Категория принадлежит другому периоду');
  }
  if (category.isArchived) {
    throw new ValidationError('Категория архивирована');
  }

  const membership = db
    .select()
    .from(memberships)
    .where(eq(memberships.id, authorMembershipId))
    .get();
  if (!membership) throw new NotFoundError('Membership', authorMembershipId);

  // Пользователь должен быть из того же household.
  const household = getHouseholdById(membership.householdId);
  if (!household || household.id !== period.householdId) {
    throw new PermissionError('Пользователь не состоит в этом бюджете');
  }

  // Дата транзакции — в границах активного периода, не в будущем.
  if (!isDateInPeriod(spentAt, { year: period.year, month: period.month }, household.timezone)) {
    throw new ValidationError('Дата траты вне текущего месяца');
  }
  if (spentAt.getTime() > Date.now() + 60_000) {
    throw new ValidationError('Дата траты в будущем');
  }

  const spentBefore = getCategorySpent(categoryId);
  const spentAfter = spentBefore + amount;

  const result = db.transaction((tx) => {
    return tx
      .insert(transactions)
      .values({
        budgetPeriodId: periodId,
        categoryId,
        authorMembershipId,
        amount,
        comment,
        spentAt,
      })
      .returning()
      .get();
  });

  const limitJustExhausted =
    spentBefore < category.limitAmount && spentAfter >= category.limitAmount;
  const wentNegative = spentBefore <= category.limitAmount && spentAfter > category.limitAmount;

  return {
    transaction: result,
    categorySpentAfter: spentAfter,
    categoryLimit: category.limitAmount,
    categoryRemainingAfter: category.limitAmount - spentAfter,
    limitJustExhausted,
    wentNegative,
  };
}

// ---------------------------------------------------------------------------
// Удаление (только admin)
// ---------------------------------------------------------------------------

export function deleteTransaction(transactionId: number, requestingUserId: number): void {
  const transaction = getTransactionById(transactionId);
  if (!transaction) throw new NotFoundError('Transaction', transactionId);

  const period = getPeriodById(transaction.budgetPeriodId);
  if (!period) throw new NotFoundError('BudgetPeriod', transaction.budgetPeriodId);
  if (period.status !== 'active') throw new PeriodArchivedError();

  const membership = getMembershipByUserId(requestingUserId);
  if (!membership || membership.householdId !== period.householdId) {
    throw new PermissionError();
  }
  if (membership.role !== 'admin') {
    throw new PermissionError('Удалять траты может только администратор');
  }

  db.delete(transactions).where(eq(transactions.id, transactionId)).run();
}

// ---------------------------------------------------------------------------
// Утилита для отчётов: список категорий, где лимит исчерпан
// ---------------------------------------------------------------------------

export type ExhaustedCategory = {
  categoryId: number;
  name: string;
  limit: number;
  spent: number;
};

/**
 * Возвращает категории, в которых spent >= limit.
 * Используется для уведомлений и для отчёта.
 */
export function listExhaustedCategories(periodId: number): ExhaustedCategory[] {
  return db
    .select({
      categoryId: categories.id,
      name: categories.name,
      limit: categories.limitAmount,
      spent: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(categories)
    .innerJoin(transactions, eq(transactions.categoryId, categories.id))
    .where(eq(categories.budgetPeriodId, periodId))
    .groupBy(categories.id)
    .all()
    .filter((r) => r.spent >= r.limit);
}

// ---------------------------------------------------------------------------
// Период: список транзакций с пагинацией и хелперы
// ---------------------------------------------------------------------------

/**
 * Загружает транзакции периода за конкретный интервал дат.
 * Используется в отчётах по дням.
 */
export function listTransactionsBetween(periodId: number, from: Date, to: Date): Transaction[] {
  return db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.budgetPeriodId, periodId),
        gte(transactions.spentAt, from),
        lte(transactions.spentAt, to),
      ),
    )
    .orderBy(asc(transactions.spentAt))
    .all();
}

/**
 * Форматированное представление транзакции для логов и отладки.
 * Не для показа пользователям.
 */
export function describeTransaction(t: Transaction): string {
  return `#${t.id} ${t.amount}₽ ${formatDateTimeShort(t.spentAt, 'Europe/Moscow')}`;
}
