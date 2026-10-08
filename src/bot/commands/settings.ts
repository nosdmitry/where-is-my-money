import type { BotContext } from '../context.js';
import { settingsKeyboard, categoriesKeyboard } from '../keyboards/inline.js';
import { formatCategoriesList } from '../texts/format.js';
import { clearWizard, setWizard } from '../wizards/index.js';
import { InlineKeyboard } from 'grammy';
import { closeHousehold } from '../../services/household.service.js';
import { getHouseholdTelegramIds } from '../../services/notification.service.js';
import {
  archiveCategory,
  deleteCategory,
  getCategoryById,
  listCategoriesWithStats,
} from '../../services/category.service.js';
import { formatMoney } from '../../utils/money.js';

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
  const list = categories.map((c) => ({
    id: c.id,
    name: c.isSystem ? `💵 ${c.name}` : c.isArchived ? `📦 ${c.name}` : c.name,
    isSystem: c.isSystem,
  }));

  const text = formatCategoriesList(categories);
  const kb = categoriesKeyboard(list);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { reply_markup: kb }).catch(() => undefined);
  } else {
    await ctx.reply(text, { reply_markup: kb });
  }
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

export async function onDeleteBudgetClick(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.appContext) return;

  if (ctx.appContext.membership.role !== 'admin') {
    await ctx.reply('⛔️ Только администратор может закрыть бюджет.');
    return;
  }

  const kb = new InlineKeyboard()
    .text('🗑 Да, закрыть', 'settings:delete:confirm')
    .text('❌ Отмена', 'settings:delete:cancel');

  await ctx.editMessageText(
    '⚠️ Это действие:\n' +
      '— закроет бюджет для всех участников,\n' +
      '— через 30 дней удалит все данные безвозвратно.\n\n' +
      'Вы уверены?',
    { reply_markup: kb },
  );
}

export async function onDeleteBudgetConfirm(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user || !ctx.appContext) return;
  if (ctx.appContext.membership.role !== 'admin') return;

  const { household } = ctx.appContext;
  const telegramIds = getHouseholdTelegramIds(household.id);

  closeHousehold(household.id, ctx.user.id);

  await ctx
    .editMessageText('🚫 Бюджет закрыт. Данные будут удалены через 30 дней.')
    .catch(() => undefined);

  const text = '🚫 Бюджет закрыт владельцем.\n\n' + 'Все данные будут удалены через 30 дней.';

  for (const tgId of telegramIds) {
    await ctx.api.sendMessage(tgId, text).catch(() => undefined);
  }
}

export async function onDeleteBudgetCancel(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText('Отменено.').catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Бюджет месяца
// ---------------------------------------------------------------------------

export async function onSettingsBudget(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.appContext) return;
  if (ctx.appContext.membership.role !== 'admin') {
    await ctx.reply('⛔️ Только администратор.');
    return;
  }

  const { activePeriod } = ctx.appContext;
  const kb = new InlineKeyboard()
    .text('✏️ Изменить лимит', 'settings:budget:edit')
    .row()
    .text('⬅️ Назад', 'settings:main');

  await ctx.editMessageText(
    `📅 Бюджет месяца\n\n` +
      `Лимит: ${formatMoney(activePeriod.totalLimit)}\n` +
      `Свободно: ${formatMoney(getFreeRemaining(activePeriod.id))}`,
    { reply_markup: kb },
  );
}

export async function onSettingsBudgetEdit(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.from || !ctx.appContext) return;
  if (ctx.appContext.membership.role !== 'admin') return;

  setWizard(ctx.from.id, { type: 'edit-total-limit', step: 'awaiting-limit' });

  await ctx.editMessageText(
    `Текущий лимит: ${formatMoney(ctx.appContext.activePeriod.totalLimit)}\n\n` +
      `Введите новый лимит в рублях.\n` +
      `Минимум — сумма лимитов всех категорий.`,
  );
}

// ---------------------------------------------------------------------------
// Карточка категории
// ---------------------------------------------------------------------------

export async function onCategoryView(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.appContext) return;

  const id = parseCategoryId(ctx.callbackQuery?.data, 'cat:view:');
  if (id === null) return;

  const category = getCategoryById(id);
  if (!category) {
    await ctx.editMessageText('Категория не найдена.');
    return;
  }

  const stats = listCategoriesWithStats(ctx.appContext.activePeriod.id).find((c) => c.id === id);
  if (!stats) return;

  const kb = new InlineKeyboard();
  const isAdmin = ctx.appContext.membership.role === 'admin';

  if (isAdmin && !stats.isSystem) {
    kb.text('✏️ Переименовать', `cat:rename:${id}`).row();
    kb.text('💰 Изменить лимит', `cat:limit:${id}`).row();
    if (stats.isArchived) {
      kb.text('📦 Разархивировать', `cat:unarchive:${id}`).row();
    } else {
      kb.text('📦 Архивировать', `cat:archive:${id}`).row();
    }
    kb.text('🗑 Удалить', `cat:delete:${id}`).row();
  }

  kb.text('⬅️ Назад', 'settings:categories');

  const archived = stats.isArchived ? ' (архив)' : '';
  const text =
    `📂 ${stats.name}${archived}\n\n` +
    `Лимит: ${formatMoney(stats.limitAmount)}\n` +
    `Потрачено: ${formatMoney(stats.spent)}\n` +
    `Осталось: ${formatMoney(stats.remaining)}`;

  await ctx.editMessageText(text, { reply_markup: kb });
}

export async function onCategoryRename(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.from || !ctx.appContext) return;
  if (ctx.appContext.membership.role !== 'admin') return;

  const id = parseCategoryId(ctx.callbackQuery?.data, 'cat:rename:');
  if (id === null) return;

  setWizard(ctx.from.id, { type: 'rename-category', step: 'awaiting-name', categoryId: id });

  await ctx.editMessageText('Введите новое название категории:');
}

export async function onCategoryEditLimit(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.from || !ctx.appContext) return;
  if (ctx.appContext.membership.role !== 'admin') return;

  const id = parseCategoryId(ctx.callbackQuery?.data, 'cat:limit:');
  if (id === null) return;

  const category = getCategoryById(id);
  if (!category) return;

  setWizard(ctx.from.id, { type: 'edit-category-limit', step: 'awaiting-limit', categoryId: id });

  await ctx.editMessageText(
    `Текущий лимит: ${formatMoney(category.limitAmount)}\n\n` +
      `Введите новый лимит в рублях.\n` +
      `Можно увеличить (за счёт свободных средств) или уменьшить.`,
  );
}

export async function onCategoryArchive(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.appContext) return;
  if (ctx.appContext.membership.role !== 'admin') return;

  const id = parseCategoryId(ctx.callbackQuery?.data, 'cat:archive:');
  if (id === null) return;

  try {
    archiveCategory(id);
    await ctx.answerCallbackQuery({ text: 'Категория архивирована.' });
    await onSettingsCategories(ctx);
  } catch (err) {
    await ctx.answerCallbackQuery({
      text: err instanceof Error ? err.message : 'Ошибка',
      show_alert: true,
    });
  }
}

export async function onCategoryDelete(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.appContext) return;
  if (ctx.appContext.membership.role !== 'admin') return;

  const id = parseCategoryId(ctx.callbackQuery?.data, 'cat:delete:');
  if (id === null) return;

  try {
    deleteCategory(id);
    await ctx.answerCallbackQuery({ text: 'Категория удалена.' });
    await onSettingsCategories(ctx);
  } catch (err) {
    await ctx.answerCallbackQuery({
      text: err instanceof Error ? err.message : 'Ошибка',
      show_alert: true,
    });
  }
}

// ---------------------------------------------------------------------------
// Хелперы
// ---------------------------------------------------------------------------

function parseCategoryId(data: string | undefined, prefix: string): number | null {
  if (!data || !data.startsWith(prefix)) return null;
  const raw = data.slice(prefix.length);
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function getFreeRemaining(periodId: number): number {
  const stats = listCategoriesWithStats(periodId);
  const free = stats.find((c) => c.isSystem);
  return free?.limitAmount ?? 0;
}
