import cron from 'node-cron';
import { createBot } from './bot/index.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { runDailyTasks, runHourlyTasks } from './services/scheduler.service.js';

const bot = createBot();

bot.catch((err) => {
  logger.error({ err: err.error }, 'bot.unhandled');
});

// Планировщик: раз в час в :05
cron.schedule('5 * * * *', () => {
  runHourlyTasks(bot.api).catch((err) => logger.error({ err }, 'cron.hourly.failed'));
});

// Планировщик: раз в сутки в 03:00 (время сервера)
cron.schedule('0 3 * * *', () => {
  runDailyTasks(bot.api).catch((err) => logger.error({ err }, 'cron.daily.failed'));
});

await bot.start({
  onStart: (info) => {
    logger.info({ username: info.username, mode: env.NODE_ENV }, 'bot.started');
  },
});
