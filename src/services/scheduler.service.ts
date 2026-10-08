import type { Api } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { and, eq, isNotNull, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { households, type BudgetPeriod } from '../db/schema.js';
import { logger } from '../config/logger.js';
import { HOUSEHOLD_HARD_DELETE_DAYS } from '../domain/constants.js';
import { formatMoney } from '../utils/money.js';
import { periodLabel } from '../utils/date.js';
import { getActivePeriod, transitionToCurrentMonth } from './budget-period.service.js';
import { getHouseholdById, listActiveHouseholds } from './household.service.js';
import { getUserById } from './user.service.js';
import { cleanupExpiredInvites } from './invite.service.js';
import { getHouseholdTelegramIds } from './notification.service.js';
import { getOrCreateUser } from './user.service.js';

/**
 * Задачи, которые надо выполнять раз в час:
 *  1. Переход месяца в активных household.
 *  2. Очистка просроченных инвайтов.
 */
export async function runHourlyTasks(api: Api): Promise<void> {
  logger.info('cron.hourly.start');

  const transitions = await runMonthTransitions(api);
  const cleanedInvites = cleanupExpiredInvites();

  logger.info({ transitions, cleanedInvites }, 'cron.hourly.done');
}

/**
 * Задачи раз в сутки:
 *  1. Hard delete закрытых household старше 30 дней.
 */
export async function runDailyTasks(api: Api): Promise<void> {
  logger.info('cron.daily.start');

  const deleted = hardDeleteClosedHouseholds();

  logger.info({ deleted }, 'cron.daily.done');
}

// ---------------------------------------------------------------------------
// Переход месяца
// ---------------------------------------------------------------------------

async function runMonthTransitions(api: Api): Promise<number> {
  const households_ = listActiveHouseholds();
  let count = 0;

  for (const household of households_) {
    // Если активного периода нет — household ещё не настроен, пропускаем.
    const activePeriod = getActivePeriod(household.id);
    if (!activePeriod) continue;

    const result = transitionToCurrentMonth(household.id, household.timezone);
    if (!result.created || !result.period) continue;

    count += 1;
    await notifyMonthTransition(api, household.id, result.period);
  }

  return count;
}

async function notifyMonthTransition(
  api: Api,
  householdId: number,
  period: BudgetPeriod,
): Promise<void> {
  const household = getHouseholdById(householdId);
  if (!household) return;

  const owner = getUserById(household.ownerUserId);
  const ownerTelegramId = owner?.telegramId ?? null;

  const telegramIds = getHouseholdTelegramIds(householdId);

  const baseText = [
    '🗓 Начался новый месяц',
    '',
    `Я создал бюджет на основе прошлого:`,
    `${periodLabel(period)} · лимит ${formatMoney(period.totalLimit)}`,
  ].join('\n');

  for (const tgId of telegramIds) {
    const isOwner = tgId === ownerTelegramId;
    try {
      if (isOwner) {
        await api.sendMessage(tgId, baseText, {
          reply_markup: new InlineKeyboard().text('⚙️ Изменить лимиты', 'settings:main'),
        });
      } else {
        await api.sendMessage(tgId, baseText);
      }
    } catch (err) {
      logger.warn({ err, tgId }, 'cron.notify.failed');
    }
  }
}

// ---------------------------------------------------------------------------
// Hard delete закрытых household
// ---------------------------------------------------------------------------

function hardDeleteClosedHouseholds(): number {
  const threshold = new Date(Date.now() - HOUSEHOLD_HARD_DELETE_DAYS * 24 * 60 * 60 * 1000);

  const result = db
    .delete(households)
    .where(
      and(
        eq(households.status, 'closed'),
        isNotNull(households.deletedAt),
        lt(households.deletedAt, threshold),
      ),
    )
    .run();

  return result.changes;
}
