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
    .text('🗑 Удалить бюджет', 'settings:delete');
}

export function categoriesKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('➕ Создать категорию', 'wizard:create-category')
    .row()
    .text('⬅️ Назад', 'settings:main');
}
