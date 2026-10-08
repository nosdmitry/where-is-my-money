import { InlineKeyboard, InputFile } from 'grammy';
import { buildPeriodSummary, buildCsv } from '../../services/report.service.js';
import {
  getSpendingByAuthor,
  getTopTransactionsDetailed,
} from '../../services/transaction.service.js';
import type { BotContext } from '../context.js';
import { formatReportText } from '../texts/format.js';

export async function onShowReport(ctx: BotContext): Promise<void> {
  if (!ctx.appContext) {
    await ctx.reply('Сначала создайте бюджет: /start');
    return;
  }

  const periodId = ctx.appContext.activePeriod.id;
  const summary = buildPeriodSummary(periodId);
  if (!summary) {
    await ctx.reply('Не удалось загрузить данные.');
    return;
  }

  const members = getSpendingByAuthor(periodId);
  const top = getTopTransactionsDetailed(periodId, 5);

  const text = formatReportText({ summary, members, top });

  const kb = new InlineKeyboard().text('📥 Экспорт CSV', 'report:csv');

  await ctx.reply(text, { reply_markup: kb });
}

export async function onExportCsv(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.appContext) return;

  const { activePeriod, household } = ctx.appContext;

  const csv = buildCsv(activePeriod.id, household.timezone);
  const filename = `budget-${activePeriod.year}-${String(activePeriod.month).padStart(2, '0')}.csv`;

  await ctx.replyWithDocument(new InputFile(Buffer.from(csv, 'utf-8'), filename), {
    caption: 'Экспорт трат в CSV.',
  });
}
