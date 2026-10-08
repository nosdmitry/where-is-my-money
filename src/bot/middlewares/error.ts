import type { NextFunction } from 'grammy';
import { logger } from '../../config/logger.js';
import { DomainError } from '../../domain/errors.js';
import type { BotContext } from '../context.js';

export async function errorMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
  try {
    await next();
  } catch (err) {
    if (err instanceof DomainError) {
      logger.warn({ code: err.code }, 'domain.error');
      await ctx.reply(`⚠️ ${err.message}`).catch(() => undefined);
      return;
    }

    logger.error({ err }, 'unexpected.error');
    await ctx.reply('😔 Что-то пошло не так. Попробуйте позже.').catch(() => undefined);
  }
}
