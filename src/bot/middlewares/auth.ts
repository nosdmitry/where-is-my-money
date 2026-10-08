import type { NextFunction } from 'grammy';
import type { BotContext } from '../context.js';
import {
  getContextByUserId,
  getHouseholdById,
  getMembershipByUserId,
} from '../../services/household.service.js';
import { getOrCreateUser } from '../../services/user.service.js';

export async function authMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
  const from = ctx.from;
  if (!from) {
    await next();
    return;
  }

  ctx.user = getOrCreateUser({
    telegramId: from.id,
    username: from.username ?? null,
    firstName: from.first_name,
  });

  const membership = getMembershipByUserId(ctx.user.id);
  if (membership) {
    const household = getHouseholdById(membership.householdId);
    if (household?.status === 'closed') {
      await ctx
        .reply('🚫 Бюджет закрыт владельцем. Данные будут удалены через 30 дней.')
        .catch(() => undefined);
      return;
    }
  }

  const app = getContextByUserId(ctx.user.id);
  if (app) ctx.appContext = app;

  await next();
}
