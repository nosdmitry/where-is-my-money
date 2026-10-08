import { createBot } from './bot/index.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

const bot = createBot();

bot.catch((err) => {
  logger.error({ err: err.error }, 'bot.unhandled');
});

await bot.start({
  onStart: (info) => {
    logger.info({ username: info.username, mode: env.NODE_ENV }, 'bot.started');
  },
});
