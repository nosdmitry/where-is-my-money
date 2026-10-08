import type { BotContext } from '../context.js';
import { listCategoriesWithStats } from '../../services/category.service.js';
import { settingsKeyboard, categoriesKeyboard } from '../keyboards/inline.js';
import { formatCategoriesList } from '../texts/format.js';
import { clearWizard, setWizard } from '../wizards/index.js';

export async function settingsCommand(ctx: BotContext): Promise<void> {
  if (!ctx.appContext) {
    await ctx.reply('Сначала создайте бюджет: /start');
    return;
  }
  if (ctx.appContext.membership.role !== 'admin') {
    await ctx.reply('⛔️ Настройки доступны только администратору.');
    return;
  }

  await ctx.reply('⚙️ Настройки', { reply_markup: settingsKeyboard() });
}

export async function onSettingsCategories(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.appContext) return;

  const categories = listCategoriesWithStats(ctx.appContext.activePeriod.id);
  await ctx.editMessageText(formatCategoriesList(categories), {
    reply_markup: categoriesKeyboard(),
  });
}

export async function onSettingsMain(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText('⚙️ Настройки', {
    reply_markup: settingsKeyboard(),
  });
}

export async function onCreateCategoryClick(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.from || !ctx.appContext) return;
  if (ctx.appContext.membership.role !== 'admin') {
    await ctx.reply('⛔️ Только администратор может создавать категории.');
    return;
  }

  setWizard(ctx.from.id, {
    type: 'create-category',
    step: 'awaiting-name',
  });

  await ctx.editMessageText('Введите название категории. Например: Продукты');
}

export async function onCancelWizard(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.from) return;
  clearWizard(ctx.from.id);
  await ctx.editMessageText('Отменено.');
}
