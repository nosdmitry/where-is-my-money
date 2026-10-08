import { Bot } from 'grammy';
import { env } from '../config/env.js';
import { cancelCommand, menuCommand, onCreateBudgetClick, startCommand } from './commands/start.js';
import type { BotContext } from './context.js';
import { authMiddleware } from './middlewares/auth.js';
import { errorMiddleware } from './middlewares/error.js';
import { handleWizardText } from './wizards/handle.js';

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(env.BOT_TOKEN);

  // Порядок важен: сначала error, потом auth, потом всё остальное.
  bot.use(errorMiddleware);
  bot.use(authMiddleware);

  // Команды
  bot.command('start', startCommand);
  bot.command('menu', menuCommand);
  bot.command('cancel', cancelCommand);

  // Inline-кнопки
  bot.callbackQuery('wizard:create-budget', onCreateBudgetClick);

  // Перехват текстового ввода в wizard'ах.
  // Если wizard не взял — пропускаем дальше.
  bot.on('message:text', async (ctx, next) => {
    const handled = await handleWizardText(ctx);
    if (!handled) await next();
  });

  return bot;
}
