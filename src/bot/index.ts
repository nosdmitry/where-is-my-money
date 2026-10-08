import { Bot, type BotConfig } from 'grammy';
import { env } from '../config/env.js';
import { cancelCommand, menuCommand, onCreateBudgetClick, startCommand } from './commands/start.js';
import {
  onCancelWizard,
  onCategoryArchive,
  onCategoryDelete,
  onCategoryEditLimit,
  onCategoryRename,
  onCategoryView,
  onCreateCategoryClick,
  onDeleteBudgetCancel,
  onDeleteBudgetClick,
  onDeleteBudgetConfirm,
  onResetPeriodCancel,
  onResetPeriodClick,
  onResetPeriodConfirm,
  onSettingsBudget,
  onSettingsBudgetEdit,
  onSettingsCategories,
  onSettingsMain,
  settingsCommand,
} from './commands/settings.js';
import { onSettingsInvite } from './commands/invite.js';
import {
  onAddExpense,
  onExpenseCancel,
  onExpenseCategoryChosen,
  onExpenseConfirm,
  onExpenseSkipComment,
} from './commands/expense.js';
import { onShowBalance } from './commands/balance.js';
import { onShowReport, onExportCsv } from './commands/report.js';
import {
  onShowHistory,
  onHistoryPage,
  onHistoryDelete,
  onHistoryNoop,
} from './commands/history.js';
import type { BotContext } from './context.js';
import { authMiddleware } from './middlewares/auth.js';
import { errorMiddleware } from './middlewares/error.js';
import { handleWizardText } from './wizards/handle.js';
import { onShowMembers } from './commands/members.js';

export async function createBot(): Promise<Bot<BotContext>> {
  const config: BotConfig<BotContext> = {};

  // Прокси нужен только локально, в разработке.
  // Динамический импорт: socks-proxy-agent живёт в devDependencies
  // и не попадает в production-образ.
  if (env.NODE_ENV === 'development' && env.SOCKS_PROXY_URL) {
    const { SocksProxyAgent } = await import('socks-proxy-agent');
    config.client = {
      baseFetchConfig: {
        agent: new SocksProxyAgent(env.SOCKS_PROXY_URL),
      },
    };
  }

  const bot = new Bot<BotContext>(env.BOT_TOKEN, config);

  bot.use(errorMiddleware);
  bot.use(authMiddleware);

  // Команды
  bot.command('start', startCommand);
  bot.command('menu', menuCommand);
  bot.command('cancel', cancelCommand);
  bot.command('settings', settingsCommand);

  // Reply-кнопки главного меню
  bot.hears('⚙️ Настройки', settingsCommand);
  bot.hears('➕ Расход', onAddExpense);
  bot.hears('💰 Остатки', onShowBalance);
  bot.hears('📊 Отчёт', onShowReport);
  bot.hears('📜 История', onShowHistory);
  bot.hears('👥 Участники', onShowMembers);

  // Inline: создание бюджета
  bot.callbackQuery('wizard:create-budget', onCreateBudgetClick);

  // Inline: настройки
  bot.callbackQuery('settings:main', onSettingsMain);
  bot.callbackQuery('settings:categories', onSettingsCategories);
  bot.callbackQuery('settings:invite', onSettingsInvite);
  bot.callbackQuery('wizard:create-category', onCreateCategoryClick);
  bot.callbackQuery('wizard:cancel', onCancelWizard);

  // Бюджет месяца
  bot.callbackQuery('settings:budget', onSettingsBudget);
  bot.callbackQuery('settings:budget:edit', onSettingsBudgetEdit);

  // Inline: закрытие бюджета
  bot.callbackQuery('settings:delete', onDeleteBudgetClick);
  bot.callbackQuery('settings:delete:confirm', onDeleteBudgetConfirm);
  bot.callbackQuery('settings:delete:cancel', onDeleteBudgetCancel);

  // Сброс текущего месяца
  bot.callbackQuery('settings:reset', onResetPeriodClick);
  bot.callbackQuery('settings:reset:confirm', onResetPeriodConfirm);
  bot.callbackQuery('settings:reset:cancel', onResetPeriodCancel);

  // Карточка категории
  bot.callbackQuery(/^cat:view:\d+$/, onCategoryView);
  bot.callbackQuery(/^cat:rename:\d+$/, onCategoryRename);
  bot.callbackQuery(/^cat:limit:\d+$/, onCategoryEditLimit);
  bot.callbackQuery(/^cat:archive:\d+$/, onCategoryArchive);
  bot.callbackQuery(/^cat:delete:\d+$/, onCategoryDelete);

  // Inline: расходы
  bot.callbackQuery(/^expense:cat:\d+$/, onExpenseCategoryChosen);
  bot.callbackQuery('expense:skip-comment', onExpenseSkipComment);
  bot.callbackQuery('expense:confirm', onExpenseConfirm);
  bot.callbackQuery('expense:cancel', onExpenseCancel);

  // Inline: отчёт
  bot.callbackQuery('report:csv', onExportCsv);

  // Inline: история
  bot.callbackQuery(/^hist:page:\d+$/, onHistoryPage);
  bot.callbackQuery(/^hist:del:\d+$/, onHistoryDelete);
  bot.callbackQuery('hist:noop', onHistoryNoop);

  // Wizard перехватывает текст последним
  bot.on('message:text', async (ctx, next) => {
    const handled = await handleWizardText(ctx);
    if (!handled) await next();
  });

  return bot;
}
