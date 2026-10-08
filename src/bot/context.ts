import type { Context } from 'grammy';
import type { BudgetPeriod, Household, Membership, User } from '../db/schema.js';

export type AppContext = {
  household: Household;
  membership: Membership;
  activePeriod: BudgetPeriod;
};

export type BotContext = Context & {
  /** Заполняется auth-middleware. */
  user?: User;
  /** Заполняется, если пользователь состоит в household с активным периодом. */
  appContext?: AppContext;
};
