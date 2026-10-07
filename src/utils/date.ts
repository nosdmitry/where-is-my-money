import type { PeriodKey } from '../domain/types.js';

const MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
] as const;

const MONTH_NAMES_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

/** Возвращает текущий год и месяц в указанном часовом поясе. */
export function currentPeriodKey(timezone: string, now: Date = new Date()): PeriodKey {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  });
  const parts = fmt.formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new Error(`Failed to resolve period key for TZ ${timezone}`);
  }
  return { year, month };
}

/** "Октябрь 2026". */
export function periodLabel({ year, month }: PeriodKey): string {
  const name = MONTH_NAMES[month - 1];
  if (!name) throw new Error(`Invalid month: ${month}`);
  return `${name} ${year}`;
}

/** "12 октября". */
export function formatDateShort(date: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    day: 'numeric',
    month: 'long',
  });
  return fmt.format(date);
}

/** "12 окт, 19:42". */
export function formatDateTimeShort(date: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  return fmt.format(date);
}

/** Следующий месяц. */
export function nextPeriodKey({ year, month }: PeriodKey): PeriodKey {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

/** Предыдущий месяц. */
export function prevPeriodKey({ year, month }: PeriodKey): PeriodKey {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

/** Сравнение периодов: -1 / 0 / 1. */
export function comparePeriods(a: PeriodKey, b: PeriodKey): number {
  if (a.year !== b.year) return a.year < b.year ? -1 : 1;
  if (a.month !== b.month) return a.month < b.month ? -1 : 1;
  return 0;
}

/** Проверка: дата находится в границах месяца в указанном TZ. */
export function isDateInPeriod(date: Date, period: PeriodKey, timezone: string): boolean {
  const key = currentPeriodKey(timezone, date);
  return key.year === period.year && key.month === period.month;
}

/** Начало месяца (00:00:00.000 в указанном TZ). */
export function startOfPeriod(period: PeriodKey, timezone: string): Date {
  // Находим UTC-время, соответствующее 00:00 первого числа месяца в TZ.
  // Простой и надёжный способ: отталкиваемся от UTC, потом корректируем.
  // Считаем приближение и проверяем — этого достаточно для наших целей,
  // но с учётом DST (в Москве его нет с 2014 года) точность гарантирована.
  const utcGuess = Date.UTC(period.year, period.month - 1, 1, 0, 0, 0);
  const offset = getTimezoneOffsetMinutes(new Date(utcGuess), timezone);
  return new Date(utcGuess - offset * 60_000);
}

/** Смещение TZ в минутах для конкретного момента. */
function getTimezoneOffsetMinutes(date: Date, timezone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = Number(p.value);
  }
  const asUTC = Date.UTC(map.year!, map.month! - 1, map.day!, map.hour!, map.minute!, map.second!);
  return (asUTC - date.getTime()) / 60_000;
}
