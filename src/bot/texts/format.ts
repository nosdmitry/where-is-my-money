import type { CategoryWithStats, PeriodSummary } from '../../domain/types.js';
import { formatMoney } from '../../utils/money.js';
import { periodLabel } from '../../utils/date.js';

export function formatPeriodSummaryText(summary: PeriodSummary): string {
  const lines: string[] = [];
  lines.push(`📅 ${periodLabel(summary)}`);
  lines.push('');
  lines.push(`Лимит:        ${formatMoney(summary.totalLimit)}`);
  lines.push(`Потрачено:    ${formatMoney(summary.totalSpent)}`);
  lines.push(`Осталось:     ${formatMoney(summary.totalRemaining)}`);
  lines.push('');
  lines.push('По категориям:');

  for (const c of summary.categories) {
    lines.push(formatCategoryLine(c));
  }
  return lines.join('\n');
}

function formatCategoryLine(c: CategoryWithStats): string {
  const spent = formatMoney(c.spent);
  const limit = formatMoney(c.limitAmount);
  const remaining = formatMoney(c.remaining);
  return `${c.name}\n  ${spent} / ${limit} · осталось ${remaining}`;
}

export function formatCategoriesList(categories: CategoryWithStats[]): string {
  if (categories.length === 0) return 'Категорий пока нет.';

  const lines = ['📂 Категории:'];
  for (const c of categories) {
    const spent = formatMoney(c.spent);
    const limit = formatMoney(c.limitAmount);
    const archived = c.isArchived ? ' (архив)' : '';
    lines.push(`• ${c.name}${archived}\n  ${spent} / ${limit}`);
  }
  return lines.join('\n');
}
