import type { Api } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { logger } from '../config/logger.js';
import { formatMoney } from '../utils/money.js';
import { periodLabel } from '../utils/date.js';
import { getActivePeriod, transitionToCurrentMonth } from './budget-period.service.js';
import { getHouseholdById, listActiveHouseholds } from './household.service.js';
import { cleanupExpiredInvites } from './invite.service.js';
import { getHouseholdTelegramIds } from './notification.service.js';
import { getUserById } from './user.service.js';
import type { BudgetPeriod } from '../db/schema.js';

export async function runHourlyTasks(api: Api): Promise<void> {
  logger.info('cron.hourly.start');
  const transitions = await runMonthTransitions(api);
  const cleanedInvites = cleanupExpiredInvites();
  logger.info({ transitions, cleanedInvites }, 'cron.hourly.done');
}

async function runMonthTransitions(api: Api): Promise<number> {
  const households_ = listActiveHouseholds();
  let count = 0;

  for (const household of households_) {
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
    'Я создал бюджет на основе прошлого:',
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
