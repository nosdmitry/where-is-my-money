import { Keyboard } from 'grammy';

export function mainMenuKeyboard(isAdmin: boolean): Keyboard {
  const kb = new Keyboard()
    .text('💰 Остатки')
    .text('➕ Расход')
    .row()
    .text('📊 Отчёт')
    .text('📜 История');

  if (isAdmin) {
    kb.row().text('⚙️ Настройки').text('👥 Участники');
  }

  return kb.resized();
}
