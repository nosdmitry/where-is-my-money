import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    telegramId: integer('telegram_id').notNull(),
    username: text('username'),
    firstName: text('first_name').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => ({
    telegramIdIdx: uniqueIndex('users_telegram_id_idx').on(table.telegramId),
  }),
);

// ---------------------------------------------------------------------------
// households
// ---------------------------------------------------------------------------
export const households = sqliteTable(
  'households',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ownerUserId: integer('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    currency: text('currency').notNull().default('RUB'),
    timezone: text('timezone').notNull().default('Europe/Moscow'),
    status: text('status', { enum: ['active', 'closed'] })
      .notNull()
      .default('active'),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => ({
    statusIdx: index('households_status_idx').on(table.status),
  }),
);

// ---------------------------------------------------------------------------
// memberships
// ---------------------------------------------------------------------------
export const memberships = sqliteTable(
  'memberships',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    householdId: integer('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['admin', 'member'] }).notNull(),
    joinedAt: integer('joined_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => ({
    userIdIdx: uniqueIndex('memberships_user_id_idx').on(table.userId),
    householdIdIdx: index('memberships_household_id_idx').on(table.householdId),
  }),
);

// ---------------------------------------------------------------------------
// budget_periods
// ---------------------------------------------------------------------------
export const budgetPeriods = sqliteTable(
  'budget_periods',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: integer('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    totalLimit: integer('total_limit').notNull(),
    status: text('status', { enum: ['active', 'archived'] })
      .notNull()
      .default('active'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => ({
    periodUnique: uniqueIndex('budget_periods_unique_idx').on(
      table.householdId,
      table.year,
      table.month,
    ),
  }),
);

// ---------------------------------------------------------------------------
// categories
// ---------------------------------------------------------------------------
export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    budgetPeriodId: integer('budget_period_id')
      .notNull()
      .references(() => budgetPeriods.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    limitAmount: integer('limit_amount').notNull(),
    isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => ({
    periodIdx: index('categories_period_idx').on(table.budgetPeriodId),
  }),
);

// ---------------------------------------------------------------------------
// transactions
// ---------------------------------------------------------------------------
export const transactions = sqliteTable(
  'transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    budgetPeriodId: integer('budget_period_id')
      .notNull()
      .references(() => budgetPeriods.id, { onDelete: 'cascade' }),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    authorMembershipId: integer('author_membership_id')
      .notNull()
      .references(() => memberships.id, { onDelete: 'restrict' }),
    amount: integer('amount').notNull(),
    comment: text('comment'),
    spentAt: integer('spent_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => ({
    periodIdx: index('transactions_period_idx').on(table.budgetPeriodId),
    categoryIdx: index('transactions_category_idx').on(table.categoryId),
    authorIdx: index('transactions_author_idx').on(table.authorMembershipId),
    spentAtIdx: index('transactions_spent_at_idx').on(table.spentAt),
  }),
);

// ---------------------------------------------------------------------------
// invites
// ---------------------------------------------------------------------------
export const invites = sqliteTable(
  'invites',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: integer('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    role: text('role', { enum: ['admin', 'member'] })
      .notNull()
      .default('member'),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    usedByUserId: integer('used_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    usedAt: integer('used_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => ({
    tokenIdx: uniqueIndex('invites_token_idx').on(table.token),
    householdIdIdx: index('invites_household_id_idx').on(table.householdId),
  }),
);

// ---------------------------------------------------------------------------
// relations (для query API Drizzle)
// ---------------------------------------------------------------------------
export const usersRelations = relations(users, ({ one, many }) => ({
  membership: one(memberships, {
    fields: [users.id],
    references: [memberships.userId],
  }),
  ownedHouseholds: many(households),
}));

export const householdsRelations = relations(households, ({ one, many }) => ({
  owner: one(users, {
    fields: [households.ownerUserId],
    references: [users.id],
  }),
  memberships: many(memberships),
  periods: many(budgetPeriods),
  invites: many(invites),
}));

export const membershipsRelations = relations(memberships, ({ one, many }) => ({
  user: one(users, {
    fields: [memberships.userId],
    references: [users.id],
  }),
  household: one(households, {
    fields: [memberships.householdId],
    references: [households.id],
  }),
  transactions: many(transactions),
}));

export const budgetPeriodsRelations = relations(budgetPeriods, ({ one, many }) => ({
  household: one(households, {
    fields: [budgetPeriods.householdId],
    references: [households.id],
  }),
  categories: many(categories),
  transactions: many(transactions),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  period: one(budgetPeriods, {
    fields: [categories.budgetPeriodId],
    references: [budgetPeriods.id],
  }),
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  period: one(budgetPeriods, {
    fields: [transactions.budgetPeriodId],
    references: [budgetPeriods.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
  author: one(memberships, {
    fields: [transactions.authorMembershipId],
    references: [memberships.id],
  }),
}));

export const invitesRelations = relations(invites, ({ one }) => ({
  household: one(households, {
    fields: [invites.householdId],
    references: [households.id],
  }),
  usedBy: one(users, {
    fields: [invites.usedByUserId],
    references: [users.id],
  }),
}));

// ---------------------------------------------------------------------------
// Утилитарные типы (используем в сервисах)
// ---------------------------------------------------------------------------
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Household = typeof households.$inferSelect;
export type NewHousehold = typeof households.$inferInsert;

export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;

export type BudgetPeriod = typeof budgetPeriods.$inferSelect;
export type NewBudgetPeriod = typeof budgetPeriods.$inferInsert;

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;
