import { parseMoney } from './money.js';

export type QuickExpenseInput = {
  amount: number;
  categoryQuery: string | null;
  comment: string | null;
};

/**
 * Разбирает быстрый ввод вида "1500 продукты мороженое".
 * Формат: <сумма> [<категория>] [<комментарий>].
 * Если после суммы ничего нет — категория и комментарий = null.
 * Если указано только одно слово — считаем его категорией.
 * Если слов больше — первое слово категория, остальные — комментарий.
 */
export function parseQuickExpense(input: string): QuickExpenseInput | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^([\d\s_]+)\s*(.*)$/);
  if (!match) return null;

  const amount = parseMoney(match[1]!);
  if (amount === null) return null;

  const rest = (match[2] ?? '').trim();
  if (rest === '') return { amount, categoryQuery: null, comment: null };

  const parts = rest.split(/\s+/);
  const categoryQuery = parts[0] ?? null;
  const comment = parts.length > 1 ? parts.slice(1).join(' ') : null;

  return { amount, categoryQuery, comment };
}

/**
 * Простой регистронезависимый поиск категории по названию.
 * Возвращает id совпавшей категории или null.
 * Точное совпадение (case-insensitive) или совпадение по префиксу.
 */
export function findCategoryByName<T extends { id: number; name: string }>(
  categories: T[],
  query: string,
): T | null {
  const q = query.toLowerCase().trim();

  const exact = categories.find((c) => c.name.toLowerCase() === q);
  if (exact) return exact;

  const prefixMatches = categories.filter((c) => c.name.toLowerCase().startsWith(q));
  if (prefixMatches.length === 1) return prefixMatches[0]!;

  return null;
}
