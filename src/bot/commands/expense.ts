import { InlineKeyboard } from 'grammy';
import { logger } from '../../config/logger.js';
import { listCategoriesWithStats } from '../../services/category.service.js';
import { getHouseholdTelegramIds } from '../../services/notification.service.js';
import { createTransaction } from '../../services/transaction.service.js';
import { formatMoney } from '../../utils/money.js';
import { findCategoryByName, parseQuickExpense } from '../../utils/parse.js';
import type { BotContext } from '../context.js';
import { clearWizard, getWizard, setWizard, type WizardState } from '../wizards/index.js';

// ---------------------------------------------------------------------------
// Вход в wizard — кнопка «➕ Расход»
// ---------------------------------------------------------------------------

export async function onAddExpense(ctx: BotContext): Promise<void> {
  if (!ctx.from || !ctx.appContext) {
    await ctx.reply('Сначала создайте бюджет: /start');
    return;
  }

  clearWizard(ctx.from.id);
  setWizard(ctx.from.id, { type: 'add-expense', step: 'awaiting-amount' });

  await ctx.reply(
    'Введите сумму расхода. Например: 1500\n\n' +
      'Можно быстрее: «1500 продукты молоко» — я сам найду категорию.',
  );
}

// ---------------------------------------------------------------------------
// Выбор категории (callback)
// ---------------------------------------------------------------------------

export async function onExpenseCategoryChosen(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.from || !ctx.appContext) return;

  const state = getWizard(ctx.from.id);
  if (!state || state.type !== 'add-expense' || state.step !== 'awaiting-category') {
    return;
  }

  const data = ctx.callbackQuery?.data;
  if (!data) return;
  const match = data.match(/^expense:cat:(\d+)$/);
  if (!match) return;

  const categoryId = Number(match[1]);
  const categories = listCategoriesWithStats(ctx.appContext.activePeriod.id);
  const category = categories.find((c) => c.id === categoryId);
  if (!category) {
    await ctx.editMessageText('Категория не найдена.');
    return;
  }

  // Если комментарий уже был (из быстрого ввода) — сразу к подтверждению
  if (state.comment) {
    const next = { ...state, step: 'awaiting-confirmation' as const, categoryId };
    setWizard(ctx.from.id, next);
    await ctx.editMessageText(`Категория: ${category.name}`).catch(() => undefined);
    await goToConfirmation(ctx, next);
    return;
  }

  setWizard(ctx.from.id, { ...state, step: 'awaiting-comment', categoryId });

  const kb = new InlineKeyboard().text('Пропустить', 'expense:skip-comment');
  await ctx.editMessageText(`Категория: ${category.name}\n\nКомментарий к трате? (необязательно)`, {
    reply_markup: kb,
  });
}

// ---------------------------------------------------------------------------
// Пропуск комментария (callback)
// ---------------------------------------------------------------------------

export async function onExpenseSkipComment(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.from || !ctx.appContext) return;

  const state = getWizard(ctx.from.id);
  if (!state || state.type !== 'add-expense' || state.step !== 'awaiting-comment') {
    return;
  }

  await ctx.editMessageText('Без комментария.').catch(() => undefined);
  await goToConfirmation(ctx, { ...state, comment: null });
}

// ---------------------------------------------------------------------------
// Подтверждение (callback)
// ---------------------------------------------------------------------------

export async function onExpenseConfirm(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.from || !ctx.appContext) return;

  const state = getWizard(ctx.from.id);
  if (!state || state.type !== 'add-expense' || state.step !== 'awaiting-confirmation') {
    return;
  }
  if (!state.amount || !state.categoryId) return;

  const result = createTransaction({
    periodId: ctx.appContext.activePeriod.id,
    categoryId: state.categoryId,
    authorMembershipId: ctx.appContext.membership.id,
    amount: state.amount,
    comment: state.comment ?? null,
    spentAt: new Date(),
  });

  clearWizard(ctx.from.id);

  const categories = listCategoriesWithStats(ctx.appContext.activePeriod.id);
  const category = categories.find((c) => c.id === state.categoryId);

  await ctx.editMessageText(
    `✅ Записано: ${formatMoney(state.amount)} → ${category?.name ?? ''}\n` +
      `Остаток: ${formatMoney(result.categoryRemainingAfter)}`,
  );

  if (result.limitJustExhausted) {
    await notifyLimitExhausted(ctx, {
      categoryName: category?.name ?? '',
      limit: result.categoryLimit,
      spent: result.categorySpentAfter,
      amount: state.amount,
      comment: state.comment ?? null,
    });
  }
}

// ---------------------------------------------------------------------------
// Отмена (callback)
// ---------------------------------------------------------------------------

export async function onExpenseCancel(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.from) return;
  clearWizard(ctx.from.id);
  await ctx.editMessageText('❌ Отменено.').catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Вспомогательные
// ---------------------------------------------------------------------------

/**
 * Переводит wizard на шаг подтверждения и показывает сводку.
 * Вызывается из callback (пропуск комментария) и из handleWizardText (быстрый ввод/комментарий).
 */
export async function goToConfirmation(
  ctx: BotContext,
  state: Extract<WizardState, { type: 'add-expense' }>,
): Promise<void> {
  if (!ctx.from || !ctx.appContext) return;
  const { amount, categoryId, comment } = state;
  if (!amount || !categoryId) return;

  const categories = listCategoriesWithStats(ctx.appContext.activePeriod.id);
  const category = categories.find((c) => c.id === categoryId);
  if (!category) {
    await ctx.reply('Категория не найдена.');
    clearWizard(ctx.from.id);
    return;
  }

  const newRemaining = category.remaining - amount;
  const willExceed = newRemaining < 0;

  setWizard(ctx.from.id, {
    ...state,
    step: 'awaiting-confirmation',
    willExceed,
  });

  const lines = [
    `Расход: ${formatMoney(amount)}`,
    `Категория: ${category.name}`,
    `Комментарий: ${comment ?? '—'}`,
    '',
    `Остаток в «${category.name}» после списания: ${formatMoney(newRemaining)}`,
  ];

  if (willExceed) {
    lines.push('');
    lines.push(`⚠️ Лимит категории будет превышен на ${formatMoney(-newRemaining)}.`);
  }

  const kb = new InlineKeyboard()
    .text(willExceed ? 'Всё равно записать' : '✅ Подтвердить', 'expense:confirm')
    .text('❌ Отмена', 'expense:cancel');

  await ctx.reply(lines.join('\n'), { reply_markup: kb });
}

/**
 * Строит inline-клавиатуру с категориями для выбора.
 */
export function buildCategoryPicker(ctx: BotContext): InlineKeyboard | null {
  if (!ctx.appContext) return null;

  const categories = listCategoriesWithStats(ctx.appContext.activePeriod.id).filter(
    (c) => !c.isArchived,
  );
  if (categories.length === 0) return null;

  const kb = new InlineKeyboard();
  for (const c of categories) {
    const label = `${c.name} · ${formatMoney(Math.max(c.remaining, 0))}`;
    kb.text(label, `expense:cat:${c.id}`).row();
  }
  return kb;
}

/**
 * Рассылает уведомление всем участникам household о том, что лимит исчерпан.
 */
async function notifyLimitExhausted(
  ctx: BotContext,
  info: {
    categoryName: string;
    limit: number;
    spent: number;
    amount: number;
    comment: string | null;
  },
): Promise<void> {
  if (!ctx.from || !ctx.appContext) return;

  const telegramIds = getHouseholdTelegramIds(ctx.appContext.household.id);
  const author = ctx.from.first_name;

  const lines = [
    '🔔 Лимит исчерпан',
    '',
    `Категория: ${info.categoryName}`,
    `Лимит: ${formatMoney(info.limit)}`,
    `Потрачено: ${formatMoney(info.spent)}`,
    '',
    `${author} внёс: ${formatMoney(info.amount)}`,
  ];
  if (info.comment) lines.push(`Комментарий: ${info.comment}`);

  const text = lines.join('\n');

  for (const telegramId of telegramIds) {
    try {
      await ctx.api.sendMessage(telegramId, text);
    } catch (err) {
      logger.warn({ err, telegramId }, 'notification.failed');
    }
  }
}

/**
 * Точка входа для текстового сообщения в шаге «ожидание суммы».
 * Обрабатывает и быстрый ввод, и обычный.
 * Возвращает true, если сообщение поглощено wizard'ом.
 */
export async function handleExpenseAmountInput(
  ctx: BotContext,
  text: string,
  state: Extract<WizardState, { type: 'add-expense' }>,
): Promise<boolean> {
  if (!ctx.from || !ctx.appContext) return false;

  // Попытка быстрого ввода: "1500 продукты молоко"
  const quick = parseQuickExpense(text);

  // Если просто число — быстрый ввод тоже сработает, categoryQuery = null
  if (quick) {
    const categories = listCategoriesWithStats(ctx.appContext.activePeriod.id).filter(
      (c) => !c.isArchived,
    );

    if (quick.categoryQuery === null) {
      // Просто сумма — просим выбрать категорию
      setWizard(ctx.from.id, {
        ...state,
        step: 'awaiting-category',
        amount: quick.amount,
        comment: null,
      });

      const kb = buildCategoryPicker(ctx);
      if (!kb) {
        await ctx.reply('Нет доступных категорий. Создайте их через /settings.');
        clearWizard(ctx.from.id);
        return true;
      }
      await ctx.reply('Выберите категорию:', { reply_markup: kb });
      return true;
    }

    // Сумма + категория (и, возможно, комментарий)
    const category = findCategoryByName(categories, quick.categoryQuery);
    if (!category) {
      setWizard(ctx.from.id, {
        ...state,
        step: 'awaiting-category',
        amount: quick.amount,
        comment: quick.comment ?? null,
      });
      const kb = buildCategoryPicker(ctx);
      await ctx.reply(`Не нашёл категорию «${quick.categoryQuery}». Выберите из списка:`, {
        reply_markup: kb ?? undefined,
      });
      return true;
    }

    setWizard(ctx.from.id, {
      ...state,
      step: 'awaiting-confirmation',
      amount: quick.amount,
      categoryId: category.id,
      comment: quick.comment ?? null,
    });

    await goToConfirmation(ctx, {
      ...state,
      amount: quick.amount,
      categoryId: category.id,
      comment: quick.comment ?? null,
    });
    return true;
  }

  await ctx.reply('Введите целое положительное число, например: 1500');
  return true;
}
