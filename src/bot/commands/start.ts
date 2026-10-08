import { InlineKeyboard } from 'grammy';
import { getContextByUserId } from '../../services/household.service.js';
import { acceptInvite } from '../../services/invite.service.js';
import { mainMenuKeyboard } from '../keyboards/main.js';
import { clearWizard, setWizard } from '../wizards/index.js';
import type { BotContext } from '../context.js';

export async function startCommand(ctx: BotContext): Promise<void> {
  if (!ctx.user || !ctx.from) return;

  const payload = typeof ctx.match === 'string' ? ctx.match : '';

  // Deep-link с инвайтом: t.me/bot?start=inv_<token>
  if (payload.startsWith('inv_')) {
    const token = payload.slice(4);
    acceptInvite(token, ctx.user.id);

    clearWizard(ctx.from.id);
    await ctx.reply('✅ Вы присоединились к бюджету!');

    const app = getContextByUserId(ctx.user.id);
    if (app) {
      await ctx.reply('Главное меню:', {
        reply_markup: mainMenuKeyboard(app.membership.role === 'admin'),
      });
    }
    return;
  }

  // Уже в бюджете — показываем меню
  const app = getContextByUserId(ctx.user.id);
  if (app) {
    await ctx.reply('Главное меню:', {
      reply_markup: mainMenuKeyboard(app.membership.role === 'admin'),
    });
    return;
  }

  // Новый пользователь
  const kb = new InlineKeyboard().text('Создать бюджет', 'wizard:create-budget');
  await ctx.reply(
    '👋 Привет! Я помогу вести семейный бюджет.\n\n' +
      'Один человек (администратор) задаёт лимит на месяц и распределяет его по категориям.\n' +
      'Остальные участники вносят свои траты.\n\n' +
      'Создать бюджет?',
    { reply_markup: kb },
  );
}

export async function menuCommand(ctx: BotContext): Promise<void> {
  if (!ctx.appContext) {
    await startCommand(ctx);
    return;
  }
  await ctx.reply('Главное меню:', {
    reply_markup: mainMenuKeyboard(ctx.appContext.membership.role === 'admin'),
  });
}

export async function cancelCommand(ctx: BotContext): Promise<void> {
  if (!ctx.from) return;
  clearWizard(ctx.from.id);
  await ctx.reply('Отменено.');
}

export async function onCreateBudgetClick(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.from || !ctx.user) return;

  if (ctx.appContext) {
    await ctx.reply('У вас уже есть бюджет.');
    return;
  }

  setWizard(ctx.from.id, {
    type: 'create-budget',
    step: 'awaiting-total-limit',
  });

  await ctx.editMessageText(
    'Отлично! Начнём с лимита на текущий месяц.\n\n' +
      'Сколько всего вы планируете потратить?\n' +
      'Введите целое число в рублях, например: 100000',
  );
}
