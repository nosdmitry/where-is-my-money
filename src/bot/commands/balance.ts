import type { BotContext } from '../context.js';
import { buildPeriodSummary } from '../../services/report.service.js';
import { formatPeriodSummaryText } from '../texts/format.js';

export async function onShowBalance(ctx: BotContext): Promise<void> {
  if (!ctx.appContext) {
    await ctx.reply('Сначала создайте бюджет: /start');
    return;
  }

  const summary = buildPeriodSummary(ctx.appContext.activePeriod.id);
  if (!summary) {
    await ctx.reply('Не удалось загрузить данные по бюджету.');
    return;
  }

  await ctx.reply(formatPeriodSummaryText(summary));
}
