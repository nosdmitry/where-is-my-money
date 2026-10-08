import { InlineKeyboard } from 'grammy';
import {
  countTransactions,
  deleteTransaction,
  listTransactionsDetailed,
} from '../../services/transaction.service.js';
import type { BotContext } from '../context.js';
import { formatHistoryText } from '../texts/format.js';

const PAGE_SIZE = 5;

export async function onShowHistory(ctx: BotContext): Promise<void> {
  if (!ctx.appContext) {
    await ctx.reply('Сначала создайте бюджет: /start');
    return;
  }
  await renderHistory(ctx, 0);
}

export async function onHistoryPage(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.from) return;

  const data = ctx.callbackQuery?.data;
  if (!data) return;
  const match = data.match(/^hist:page:(\d+)$/);
  if (!match) return;

  const page = Number(match[1]);
  await renderHistory(ctx, page, true);
}

export async function onHistoryDelete(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.from || !ctx.user || !ctx.appContext) return;

  const data = ctx.callbackQuery?.data;
  if (!data) return;
  const match = data.match(/^hist:del:(\d+)$/);
  if (!match) return;

  const transactionId = Number(match[1]);

  if (ctx.appContext.membership.role !== 'admin') {
    await ctx.answerCallbackQuery({
      text: 'Удалять траты может только администратор.',
      show_alert: true,
    });
    return;
  }

  try {
    deleteTransaction(transactionId, ctx.user.id);
  } catch (err) {
    await ctx.answerCallbackQuery({
      text: err instanceof Error ? err.message : 'Ошибка удаления.',
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery({ text: 'Трата удалена.' });
  await renderHistory(ctx, 0, true);
}

// ---------------------------------------------------------------------------

async function renderHistory(
  ctx: BotContext,
  page: number,
  isEdit: boolean = false,
): Promise<void> {
  if (!ctx.appContext) return;

  const { activePeriod, household, membership } = ctx.appContext;
  const total = countTransactions(activePeriod.id);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);

  const items = listTransactionsDetailed(activePeriod.id, PAGE_SIZE, safePage * PAGE_SIZE);

  const text = formatHistoryText({
    year: activePeriod.year,
    month: activePeriod.month,
    items,
    page: safePage,
    totalPages,
    total,
    timezone: household.timezone,
  });

  const kb = new InlineKeyboard();

  // Кнопки удаления — только для админа и только для видимых транзакций.
  if (membership.role === 'admin' && items.length > 0) {
    const row: Array<{ text: string; data: string }> = items.map((t, i) => ({
      text: `🗑 ${safePage * PAGE_SIZE + i + 1}`,
      data: `hist:del:${t.id}`,
    }));
    for (const b of row) kb.text(b.text, b.data);
    kb.row();
  }

  // Навигация
  if (totalPages > 1) {
    if (safePage > 0) kb.text('◀️', `hist:page:${safePage - 1}`);
    kb.text(`${safePage + 1}/${totalPages}`, 'hist:noop');
    if (safePage < totalPages - 1) kb.text('▶️', `hist:page:${safePage + 1}`);
  }

  const options = {
    reply_markup: totalPages > 1 || membership.role === 'admin' ? kb : undefined,
  };

  if (isEdit) {
    await ctx.editMessageText(text, options).catch(() => undefined);
  } else {
    await ctx.reply(text, options);
  }
}

export async function onHistoryNoop(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
}
