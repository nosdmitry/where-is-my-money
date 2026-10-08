import type { BotContext } from '../context.js';
import { getHouseholdMembers } from '../../services/household.service.js';
import { getSpendingByAuthor } from '../../services/transaction.service.js';
import { getUserById } from '../../services/user.service.js';
import { formatMoney } from '../../utils/money.js';
import { periodLabel } from '../../utils/date.js';

export async function onShowMembers(ctx: BotContext): Promise<void> {
  if (!ctx.appContext) {
    await ctx.reply('Сначала создайте бюджет: /start');
    return;
  }

  const { household, activePeriod, membership } = ctx.appContext;

  const memberships = getHouseholdMembers(household.id);
  const spending = getSpendingByAuthor(activePeriod.id);
  const spendingByMembership = new Map(spending.map((s) => [s.membershipId, s.spent]));

  const lines: string[] = [];
  lines.push(`👥 Участники · ${periodLabel(activePeriod)}`);
  lines.push('');

  for (const m of memberships) {
    const user = getUserById(m.userId);
    if (!user) continue;

    const name = user.username ? `@${user.username}` : user.firstName;
    const role = m.role === 'admin' ? ' · админ' : '';
    const you = m.id === membership.id ? ' (вы)' : '';
    const spent = spendingByMembership.get(m.id) ?? 0;

    lines.push(`${name}${role}${you}`);
    lines.push(`  Потрачено: ${formatMoney(spent)}`);
    lines.push('');
  }

  lines.push(`Всего участников: ${memberships.length}`);

  await ctx.reply(lines.join('\n'));
}
