import { MAX_TRANSACTION_AMOUNT } from '../domain/constants.js';

/**
 * Парсит пользовательский ввод суммы.
 * Принимает только целые положительные числа.
 * Разделители тысяч (пробелы, подчёркивания) игнорируются.
 * Возвращает null, если ввод некорректен.
 */
export function parseMoney(input: string): number | null {
  const cleaned = input.trim().replace(/[\s_]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;

  const value = Number.parseInt(cleaned, 10);
  if (!Number.isSafeInteger(value) || value <= 0) return null;

  return value;
}

/** Формат для отображения: "1 500 ₽". */
export function formatMoney(rubles: number): string {
  return rubles.toLocaleString('ru-RU') + ' ₽';
}

/**
 * Формат со знаком: "+500 ₽" / "−500 ₽" / "0 ₽".
 * Минус — типографский (−, U+2212), а не дефис, — выглядит лучше.
 */
export function formatMoneyDelta(rubles: number): string {
  if (rubles === 0) return '0 ₽';
  const sign = rubles > 0 ? '+' : '−';
  return sign + Math.abs(rubles).toLocaleString('ru-RU') + ' ₽';
}

/** Проверка: сумма в допустимом диапазоне. */
export function isValidAmount(rubles: number): boolean {
  return Number.isSafeInteger(rubles) && rubles > 0 && rubles <= MAX_TRANSACTION_AMOUNT;
}
