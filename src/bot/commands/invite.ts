import type { BotContext } from '../context.js';
import { createInvite } from '../../services/invite.service.js';

export async function onSettingsInvite(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery();
  if (!ctx.user || !ctx.appContext) return;

  const { household, membership } = ctx.appContext;

  if (membership.role !== 'admin') {
    await ctx.reply('⛔️ Приглашать участников может только администратор.');
    return;
  }

  const botUsername = ctx.me.username;
  const { token, expiresAt } = createInvite(household.id, ctx.user.id);

  const link = `https://t.me/${botUsername}?start=inv_${token}`;
  const hoursLeft = Math.round((expiresAt.getTime() - Date.now()) / (60 * 60 * 1000));

  const text = [
    '✉️ Приглашение в семейный бюджет',
    '',
    'Отправьте эту ссылку тому, кого хотите добавить.',
    'Действует одноразово, срок — ' + hoursLeft + ' ч.',
    '',
    `<code>${link}</code>`,
    '',
    'Получатель откроет ссылку в Telegram, нажмёт «Присоединиться», и станет участником.',
  ].join('\n');

  await ctx.editMessageText(text, { parse_mode: 'HTML' }).catch(async () => {
    // Если сообщение нельзя отредактировать — отправляем новым.
    await ctx.reply(text, { parse_mode: 'HTML' });
  });
}
