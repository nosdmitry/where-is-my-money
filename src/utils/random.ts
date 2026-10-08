/**
 * Возвращает случайный элемент массива.
 * Бросает ошибку, если массив пустой.
 */
export function pickRandom<T>(items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error('pickRandom: empty array');
  }
  return items[Math.floor(Math.random() * items.length)]!;
}
