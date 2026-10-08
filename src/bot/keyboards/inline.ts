import { InlineKeyboard } from 'grammy';
import type { CategoryWithStats } from '../../domain/types.js';
import { formatMoney } from '../../utils/money.js';

export function categoryPickerKeyboard(
  categories: CategoryWithStats[],
  prefix: string,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const c of categories) {
    const label = `${c.name} · ${formatMoney(Math.max(c.remaining, 0))}`;
    kb.text(label, `${prefix}${c.id}`).row();
  }
  return kb;
}

export function confirmKeyboard(confirmData: string, cancelData: string): InlineKeyboard {
  return new InlineKeyboard().text('✅ Подтвердить', confirmData).text('❌ Отмена', cancelData);
}

export function settingsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📅 Бюджет месяца', 'settings:budget')
    .row()
    .text('📂 Категории', 'settings:categories')
    .row()
    .text('✉️ Пригласить', 'settings:invite')
    .row()
    .text('♻️ Сбросить текущий месяц', 'settings:reset')
    .row()
    .text('🗑 Удалить бюджет полностью', 'settings:delete');
}

export function categoriesKeyboard(
  categories?: Array<{ id: number; name: string; isSystem: boolean }>,
): InlineKeyboard {
  const kb = new InlineKeyboard();

  if (categories && categories.length > 0) {
    for (const c of categories) {
      kb.text(c.name, `cat:view:${c.id}`).row();
    }
  }

  kb.text('➕ Создать категорию', 'wizard:create-category').row();
  kb.text('⬅️ Назад', 'settings:main');

  return kb;
}
