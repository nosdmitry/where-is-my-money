export type Role = 'admin' | 'member';
export type PeriodStatus = 'active' | 'archived';
export type HouseholdStatus = 'active' | 'closed';

export type PeriodKey = {
  year: number;
  month: number;
};

/** Категория с подcчитанными тратами. */
export type CategoryWithStats = {
  id: number;
  name: string;
  limitAmount: number;
  isSystem: boolean;
  isArchived: boolean;
  sortOrder: number;
  spent: number;
  remaining: number;
};

/** Сводка по периоду. */
export type PeriodSummary = {
  periodId: number;
  year: number;
  month: number;
  status: PeriodStatus;
  totalLimit: number;
  totalSpent: number;
  totalRemaining: number;
  categories: CategoryWithStats[];
};

/** Разбивка трат по участникам. */
export type MemberSpending = {
  membershipId: number;
  displayName: string;
  spent: number;
};
