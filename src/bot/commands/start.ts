import { InlineKeyboard } from 'grammy';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { users } from '../../db/schema.js';
import { getContextByUserId, getHouseholdById } from '../../services/household.service.js';
import { acceptInvite } from '../../services/invite.service.js';
import { getActivePeriod } from '../../services/budget-period.service.js';
import { formatMoney } from '../../utils/money.js';
import { periodLabel } from '../../utils/date.js';
import { mainMenuKeyboard } from '../keyboards/main.js';
import { clearWizard, setWizard } from '../wizards/index.js';
import type { BotContext } from '../context.js';

export async function startCommand(ctx: BotContext): Promise<void> {
  if (!ctx.user || !ctx.from) return;

  const payload = typeof ctx.match === 'string' ? ctx.match : '';

  // Deep-link с инвайтом
  if (payload.startsWith('inv_')) {
    const token = payload.slice(4);
    const result = acceptInvite(token, ctx.user.id);

    clearWizard(ctx.from.id);
    await sendWelcomeToNewMember(ctx, result.householdId, ctx.user.id);
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

/**
 * Приветствие нового участника после принятия инвайта.
 */
async function sendWelcomeToNewMember(
  ctx: BotContext,
  householdId: number,
  userId: number,
): Promise<void> {
  const household = getHouseholdById(householdId);
  if (!household) {
    await ctx.reply('Не удалось загрузить данные бюджета.');
    return;
  }

  // Имя админа
  const admin = db.select().from(users).where(eq(users.id, household.ownerUserId)).get();
  const adminName = admin?.firstName ?? 'Администратор';

  // Активный период
  const period = getActivePeriod(householdId);

  const lines: string[] = [];
  lines.push('🎉 Вы присоединились к семейному бюджету!');
  lines.push('');
  lines.push(`Администратор: ${adminName}`);

  if (period) {
    lines.push(`Период: ${periodLabel(period)}`);
    lines.push(`Общий лимит: ${formatMoney(period.totalLimit)}`);
  }

  lines.push('');
  lines.push('Что вы можете:');
  lines.push('➕ вносить расходы');
  lines.push('💰 смотреть остатки');
  lines.push('📊 смотреть отчёт и историю');
  lines.push('');
  lines.push('Лимиты и категории меняет только администратор.');

  await ctx.reply(lines.join('\n'));

  // Контекст теперь есть — показываем меню
  const app = getContextByUserId(userId);
  if (app) {
    await ctx.reply('Главное меню:', {
      reply_markup: mainMenuKeyboard(app.membership.role === 'admin'),
    });
  }
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
