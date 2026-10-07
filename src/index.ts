import { Bot } from 'grammy';
import { env } from './config/env.js';

const bot = new Bot(env.BOT_TOKEN);

bot.command('start', async (ctx) => {
  await ctx.reply('Привет! Я бот для учёта семейного бюджета.');
});

bot.catch((err) => {
  console.error('Bot error:', err.error);
});

await bot.start({
  onStart: (info) => {
    console.log(`🤖 Bot @${info.username} started in ${env.NODE_ENV} mode`);
  },
});
