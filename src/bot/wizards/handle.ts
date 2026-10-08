import type { BotContext } from '../context.js';
import { createHousehold } from '../../services/household.service.js';
import { formatMoney, parseMoney } from '../../utils/money.js';
import { periodLabel } from '../../utils/date.js';
import { mainMenuKeyboard } from '../keyboards/main.js';
import { clearWizard, getWizard } from './index.js';

const MAX_TOTAL_LIMIT = 1_000_000_000;

/**
 * Обрабатывает текстовый ввод, если у пользователя активен wizard.
 * Возвращает true, если сообщение было поглощено.
 */
export async function handleWizardText(ctx: BotContext): Promise<boolean> {
  if (!ctx.from || !ctx.user || !ctx.message?.text) return false;

  const state = getWizard(ctx.from.id);
  if (!state) return false;

  const text = ctx.message.text.trim();

  if (state.type === 'create-budget' && state.step === 'awaiting-total-limit') {
    const amount = parseMoney(text);
    if (amount === null) {
      await ctx.reply('Введите целое положительное число, например: 100000');
      return true;
    }
    if (amount > MAX_TOTAL_LIMIT) {
      await ctx.reply('Слишком большая сумма. Попробуйте меньше.');
      return true;
    }

    clearWizard(ctx.from.id);

    const { period } = createHousehold(ctx.user.id, amount, 'Europe/Moscow');

    await ctx.reply(
      `✅ Бюджет на ${periodLabel(period)} создан.\n` + `Лимит: ${formatMoney(period.totalLimit)}`,
    );
    await ctx.reply('Главное меню:', {
      reply_markup: mainMenuKeyboard(true),
    });
    return true;
  }

  return false;
}
