import type { NextFunction } from 'grammy';
import type { BotContext } from '../context.js';
import { getContextByUserId } from '../../services/household.service.js';
import { getOrCreateUser } from '../../services/user.service.js';

export async function authMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
  const from = ctx.from;
  if (from) {
    ctx.user = getOrCreateUser({
      telegramId: from.id,
      username: from.username ?? null,
      firstName: from.first_name,
    });

    const app = getContextByUserId(ctx.user.id);
    if (app) ctx.appContext = app;
  }
  await next();
}
