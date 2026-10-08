import { Bot, type BotConfig } from 'grammy';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { env } from '../config/env.js';
import { cancelCommand, menuCommand, onCreateBudgetClick, startCommand } from './commands/start.js';
import {
  onCancelWizard,
  onCreateCategoryClick,
  onSettingsCategories,
  onSettingsMain,
  settingsCommand,
} from './commands/settings.js';
import {
  onAddExpense,
  onExpenseCancel,
  onExpenseCategoryChosen,
  onExpenseConfirm,
  onExpenseSkipComment,
} from './commands/expense.js';
import type { BotContext } from './context.js';
import { authMiddleware } from './middlewares/auth.js';
import { errorMiddleware } from './middlewares/error.js';
import { handleWizardText } from './wizards/handle.js';
import { onShowBalance } from './commands/balance.js';

export function createBot(): Bot<BotContext> {
  const config: BotConfig<BotContext> = {};

  if (env.NODE_ENV === 'development' && env.SOCKS_PROXY_URL) {
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

  // Inline: создание бюджета
  bot.callbackQuery('wizard:create-budget', onCreateBudgetClick);

  // Inline: настройки
  bot.callbackQuery('settings:main', onSettingsMain);
  bot.callbackQuery('settings:categories', onSettingsCategories);
  bot.callbackQuery('wizard:create-category', onCreateCategoryClick);
  bot.callbackQuery('wizard:cancel', onCancelWizard);

  // Inline: расходы
  bot.callbackQuery(/^expense:cat:\d+$/, onExpenseCategoryChosen);
  bot.callbackQuery('expense:skip-comment', onExpenseSkipComment);
  bot.callbackQuery('expense:confirm', onExpenseConfirm);
  bot.callbackQuery('expense:cancel', onExpenseCancel);

  // Wizard перехватывает текст последним
  bot.on('message:text', async (ctx, next) => {
    const handled = await handleWizardText(ctx);
    if (!handled) await next();
  });

  return bot;
}
