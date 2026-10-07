/**
 * Базовая доменная ошибка.
 * Все ошибки, которые могут быть показаны пользователю в боте,
 * должны наследоваться от DomainError.
 */
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Неверные входные данные. */
export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
  }
}

/** Сущность не найдена. */
export class NotFoundError extends DomainError {
  constructor(entity: string, id?: number | string) {
    super(id !== undefined ? `${entity} #${id} не найден` : `${entity} не найден`, 'NOT_FOUND');
  }
}

/** Конфликт: нарушение уникальности или инварианта. */
export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 'CONFLICT');
  }
}

/** Нет прав на действие. */
export class PermissionError extends DomainError {
  constructor(message = 'Недостаточно прав') {
    super(message, 'PERMISSION_DENIED');
  }
}

/** Не хватает свободных средств при создании/изменении категории. */
export class InsufficientFundsError extends DomainError {
  constructor(
    public readonly available: number,
    public readonly requested: number,
  ) {
    super(
      `Недостаточно свободных средств: доступно ${available} ₽, запрошено ${requested} ₽`,
      'INSUFFICIENT_FUNDS',
    );
  }
}

/** Действие над архивным периодом. */
export class PeriodArchivedError extends DomainError {
  constructor() {
    super('Период архивирован. Изменения недоступны.', 'PERIOD_ARCHIVED');
  }
}

/** Нельзя удалить категорию с транзакциями. */
export class CategoryHasTransactionsError extends DomainError {
  constructor() {
    super(
      'Нельзя удалить категорию, в которой есть траты. Архивируйте её.',
      'CATEGORY_HAS_TRANSACTIONS',
    );
  }
}

/** Инвайт просрочен. */
export class InviteExpiredError extends DomainError {
  constructor() {
    super('Приглашение истекло.', 'INVITE_EXPIRED');
  }
}

/** Инвайт уже использован. */
export class InviteAlreadyUsedError extends DomainError {
  constructor() {
    super('Приглашение уже использовано.', 'INVITE_ALREADY_USED');
  }
}

/** Household закрыт владельцем. */
export class HouseholdClosedError extends DomainError {
  constructor() {
    super('Бюджет закрыт владельцем.', 'HOUSEHOLD_CLOSED');
  }
}
