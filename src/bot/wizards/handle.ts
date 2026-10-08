import type { BotContext } from '../context.js';
import { createCategory, listCategoriesWithStats } from '../../services/category.service.js';
import { createHousehold } from '../../services/household.service.js';
import { InsufficientFundsError } from '../../domain/errors.js';
import { formatMoney, parseMoney } from '../../utils/money.js';
import { periodLabel } from '../../utils/date.js';
import { categoriesKeyboard } from '../keyboards/inline.js';
import { goToConfirmation, handleExpenseAmountInput } from '../commands/expense.js';
import { clearWizard, getWizard, setWizard } from './index.js';

const MAX_TOTAL_LIMIT = 1_000_000_000;
const MAX_CATEGORY_LIMIT = 1_000_000_000;
const MAX_COMMENT_LENGTH = 200;

/**
 * Обрабатывает текстовый ввод, если у пользователя активен wizard.
 * Возвращает true, если сообщение было поглощено.
 */
export async function handleWizardText(ctx: BotContext): Promise<boolean> {
  if (!ctx.from || !ctx.user || !ctx.message?.text) return false;

  const state = getWizard(ctx.from.id);
  if (!state) return false;

  const text = ctx.message.text.trim();

  // -------------------------------------------------------------------------
  // Создание бюджета
  // -------------------------------------------------------------------------
  if (state.type === 'create-budget' && state.step === 'awaiting-total-limit') {
    const amount = parseMoney(text);
    if (amount === null || amount > MAX_TOTAL_LIMIT) {
      await ctx.reply('Введите целое положительное число, например: 100000');
      return true;
    }

    clearWizard(ctx.from.id);
    const { period } = createHousehold(ctx.user.id, amount, 'Europe/Moscow');

    await ctx.reply(
      `✅ Бюджет на ${periodLabel(period)} создан.\nЛимит: ${formatMoney(period.totalLimit)}`,
    );
    await ctx.reply(
      'Теперь создайте первую категорию — например, «Продукты» или «Коммуналка».\n' +
        'Все деньги пока в категории «Свободные средства».',
      { reply_markup: categoriesKeyboard() },
    );
    return true;
  }

  // -------------------------------------------------------------------------
  // Создание категории
  // -------------------------------------------------------------------------
  if (state.type === 'create-category') {
    if (!ctx.appContext) {
      clearWizard(ctx.from.id);
      await ctx.reply('Нет активного бюджета.');
      return true;
    }

    if (state.step === 'awaiting-name') {
      const name = text;
      if (name.length === 0 || name.length > 50) {
        await ctx.reply('Название от 1 до 50 символов. Попробуйте снова.');
        return true;
      }

      setWizard(ctx.from.id, {
        type: 'create-category',
        step: 'awaiting-limit',
        name,
      });

      const summary = listCategoriesWithStats(ctx.appContext.activePeriod.id);
      const free = summary.find((c) => c.isSystem);
      await ctx.reply(
        `Название: «${name}»\n\nЛимит для этой категории?\nСвободно: ${formatMoney(free?.limitAmount ?? 0)}`,
      );
      return true;
    }

    if (state.step === 'awaiting-limit') {
      const limit = parseMoney(text);
      if (limit === null || limit > MAX_CATEGORY_LIMIT) {
        await ctx.reply('Введите целое положительное число, например: 40000');
        return true;
      }

      try {
        const category = createCategory(ctx.appContext.activePeriod.id, state.name ?? '', limit);
        clearWizard(ctx.from.id);

        const summary = listCategoriesWithStats(ctx.appContext.activePeriod.id);
        const free = summary.find((c) => c.isSystem);

        await ctx.reply(
          `✅ Категория «${category.name}» создана: ${formatMoney(category.limitAmount)}\n` +
            `Свободные средства: ${formatMoney(free?.limitAmount ?? 0)}`,
        );
        await ctx.reply('Что дальше?', { reply_markup: categoriesKeyboard() });
      } catch (err) {
        if (err instanceof InsufficientFundsError) {
          await ctx.reply(
            `❌ Недостаточно свободных средств.\n` +
              `Доступно: ${formatMoney(err.available)}\n` +
              `Введено: ${formatMoney(err.requested)}`,
          );
          return true;
        }
        throw err;
      }
      return true;
    }
  }

  // -------------------------------------------------------------------------
  // Добавление расхода
  // -------------------------------------------------------------------------
  if (state.type === 'add-expense') {
    if (!ctx.appContext) {
      clearWizard(ctx.from.id);
      await ctx.reply('Нет активного бюджета.');
      return true;
    }

    if (state.step === 'awaiting-amount') {
      return handleExpenseAmountInput(ctx, text, state);
    }

    if (state.step === 'awaiting-comment') {
      const comment = text.length > MAX_COMMENT_LENGTH ? text.slice(0, MAX_COMMENT_LENGTH) : text;
      await goToConfirmation(ctx, { ...state, comment });
      return true;
    }

    if (state.step === 'awaiting-confirmation') {
      await ctx.reply('Нажмите «Подтвердить» или «Отмена» на клавиатуре выше.');
      return true;
    }

    if (state.step === 'awaiting-category') {
      await ctx.reply('Выберите категорию из списка кнопок выше.');
      return true;
    }
  }

  return false;
}
