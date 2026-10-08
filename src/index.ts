import path from 'node:path';
import cron from 'node-cron';
import { createBot } from './bot/index.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { runMigrations } from './db/migrate.js';
import { runDailyTasks, runHourlyTasks } from './services/scheduler.service.js';

// Миграции при старте
const migrationsFolder = path.join(process.cwd(), 'src/db/migrations');
runMigrations(migrationsFolder);
logger.info({ migrationsFolder }, 'db.migrations.applied');

const bot = await createBot();

bot.catch((err) => {
  logger.error({ err: err.error }, 'bot.unhandled');
});

cron.schedule('5 * * * *', () => {
  runHourlyTasks(bot.api).catch((err) => logger.error({ err }, 'cron.hourly.failed'));
});

cron.schedule('0 3 * * *', () => {
  runDailyTasks(bot.api).catch((err) => logger.error({ err }, 'cron.daily.failed'));
});

await bot.start({
  onStart: (info) => {
    logger.info({ username: info.username, mode: env.NODE_ENV }, 'bot.started');
  },
});
