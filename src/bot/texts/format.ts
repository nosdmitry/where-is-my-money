import type { CategoryWithStats, PeriodSummary } from '../../domain/types.js';
import { formatMoney } from '../../utils/money.js';
import { formatDateTimeShort, periodLabel } from '../../utils/date.js';
import type { MemberSpending } from '../../domain/types.js';
import type { DetailedTransaction } from '../../services/transaction.service.js';

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

export function formatReportText(params: {
  summary: PeriodSummary;
  members: MemberSpending[];
  top: DetailedTransaction[];
}): string {
  const { summary, members, top } = params;
  const lines: string[] = [];

  lines.push(`📊 Отчёт · ${periodLabel(summary)}`);
  lines.push('');
  lines.push(`Общий лимит:   ${formatMoney(summary.totalLimit)}`);
  lines.push(`Потрачено:     ${formatMoney(summary.totalSpent)}`);
  lines.push(`Осталось:      ${formatMoney(summary.totalRemaining)}`);

  lines.push('');
  lines.push('По категориям:');
  for (const c of summary.categories) {
    lines.push(`  ${c.name}: ${formatMoney(c.spent)} / ${formatMoney(c.limitAmount)}`);
  }

  if (members.length > 0) {
    lines.push('');
    lines.push('По участникам:');
    for (const m of members) {
      lines.push(`  ${m.displayName}: ${formatMoney(m.spent)}`);
    }
  }

  if (top.length > 0) {
    lines.push('');
    lines.push(`Топ-${top.length} трат:`);
    top.forEach((t, i) => {
      lines.push(
        `  ${i + 1}. ${formatMoney(t.amount)} · ${t.categoryName} · ${t.authorUsername ? '@' + t.authorUsername : t.authorFirstName}`,
      );
    });
  }

  return lines.join('\n');
}

export function formatHistoryText(params: {
  year: number;
  month: number;
  items: DetailedTransaction[];
  page: number;
  totalPages: number;
  total: number;
  timezone: string;
}): string {
  const { year, month, items, page, totalPages, total, timezone } = params;
  const label = periodLabel({ year, month });
  const lines: string[] = [];

  lines.push(`📜 История · ${label}`);
  lines.push(`Всего трат: ${total} · Стр. ${page + 1}/${totalPages}`);
  lines.push('');

  if (items.length === 0) {
    lines.push('Пока нет трат.');
    return lines.join('\n');
  }

  items.forEach((t, i) => {
    const num = page * items.length + i + 1;
    const date = formatDateTimeShort(t.spentAt, timezone);
    const author = t.authorUsername ? `@${t.authorUsername}` : t.authorFirstName;
    lines.push(`${num}. ${date} · ${formatMoney(t.amount)} · ${t.categoryName} · ${author}`);
    if (t.comment) lines.push(`   ${t.comment}`);
  });

  return lines.join('\n');
}
