import { getOrCreateUser } from './services/user.service.js';
import { createHousehold } from './services/household.service.js';
import {
  createCategory,
  listCategoriesWithStats,
  deleteCategory,
  updateCategoryLimit,
} from './services/category.service.js';
import {
  createTransaction,
  getCategorySpent,
  getSpendingByAuthor,
  deleteTransaction,
  listExhaustedCategories,
} from './services/transaction.service.js';
import { formatMoney } from './utils/money.js';
import { getActivePeriod } from './services/budget-period.service.js';

const user = getOrCreateUser({ telegramId: 1, username: 'admin', firstName: 'Админ' });
const { household, membership, period } = createHousehold(user.id, 100_000, 'Europe/Moscow');

const products = createCategory(period.id, 'Продукты', 40_000);
const utility = createCategory(period.id, 'Коммуналка', 10_000);

console.log('--- категории после создания ---');
for (const c of listCategoriesWithStats(period.id)) {
  console.log(
    `  ${c.name}: лимит ${formatMoney(c.limitAmount)}, потрачено ${formatMoney(c.spent)}, осталось ${formatMoney(c.remaining)}`,
  );
}

// Трата 500 ₽
const r1 = createTransaction({
  periodId: period.id,
  categoryId: products.id,
  authorMembershipId: membership.id,
  amount: 500,
  comment: 'молоко',
  spentAt: new Date(),
});
console.log(
  'Создана трата:',
  r1.transaction.id,
  'осталось в категории:',
  formatMoney(r1.categoryRemainingAfter),
);
console.log('Флаги:', { limitJustExhausted: r1.limitJustExhausted, wentNegative: r1.wentNegative });

// Трата 39 600 ₽ — исчерпает лимит
const r2 = createTransaction({
  periodId: period.id,
  categoryId: products.id,
  authorMembershipId: membership.id,
  amount: 39_600,
  comment: null,
  spentAt: new Date(),
});
console.log('Флаги после исчерпания:', {
  limitJustExhausted: r2.limitJustExhausted,
  wentNegative: r2.wentNegative,
});

console.log('Исчерпанные:', listExhaustedCategories(period.id));

console.log('Разбивка по авторам:', getSpendingByAuthor(period.id));

// Попытка удалить категорию с транзакциями
try {
  deleteCategory(products.id);
} catch (e) {
  console.log('Ожидаемая ошибка:', (e as Error).message);
}

// Обновление лимита продуктов вверх на 5 000
const upd = updateCategoryLimit(products.id, 45_000);
console.log(
  'Новый лимит:',
  formatMoney(upd.category.limitAmount),
  'остаток:',
  formatMoney(upd.remaining),
);

// Удаление транзакции админом
deleteTransaction(r2.transaction.id, user.id);
console.log('После удаления трат:', formatMoney(getCategorySpent(products.id)));

// Попытка удалить транзакцию обычным участником — создадим второго юзера
// ... (это в шаге 6, тут пропустим)
