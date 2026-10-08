import { asc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { categories, memberships, transactions, users } from '../db/schema.js';
import { NotFoundError } from '../domain/errors.js';
import type { PeriodSummary } from '../domain/types.js';
import { formatDateTimeShort } from '../utils/date.js';
import { getPeriodById } from './budget-period.service.js';
import { listCategoriesWithStats } from './category.service.js';

/**
 * Сводка по периоду: общий лимит, траты, остатки, категории.
 */
export function buildPeriodSummary(periodId: number): PeriodSummary | null {
  const period = getPeriodById(periodId);
  if (!period) return null;

  const categories_ = listCategoriesWithStats(periodId);
  const totalSpent = categories_.reduce((sum, c) => sum + c.spent, 0);

  return {
    periodId: period.id,
    year: period.year,
    month: period.month,
    status: period.status,
    totalLimit: period.totalLimit,
    totalSpent,
    totalRemaining: period.totalLimit - totalSpent,
    categories: categories_,
  };
}

/**
 * CSV-экспорт транзакций периода.
 * BOM в начале — чтобы Excel корректно открыл UTF-8.
 * Разделитель — `;`, потому что в русской локали Excel ждёт `;`, а не `,`.
 */
export function buildCsv(periodId: number, timezone: string): string {
  const period = getPeriodById(periodId);
  if (!period) throw new NotFoundError('BudgetPeriod', periodId);

  const rows = db
    .select({
      spentAt: transactions.spentAt,
      categoryName: categories.name,
      amount: transactions.amount,
      comment: transactions.comment,
      authorFirstName: users.firstName,
      authorUsername: users.username,
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .innerJoin(memberships, eq(memberships.id, transactions.authorMembershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(transactions.budgetPeriodId, periodId))
    .orderBy(asc(transactions.spentAt))
    .all();

  const BOM = '\uFEFF';
  const header = 'Дата;Категория;Сумма;Комментарий;Автор';
  const lines = rows.map((r) =>
    [
      formatDateTimeShort(r.spentAt, timezone),
      r.categoryName,
      String(r.amount),
      r.comment ?? '',
      r.authorUsername ? `@${r.authorUsername}` : r.authorFirstName,
    ]
      .map(csvEscape)
      .join(';'),
  );

  return BOM + [header, ...lines].join('\n');
}

function csvEscape(value: string): string {
  if (/[;"\n\r]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
  return value;
}
