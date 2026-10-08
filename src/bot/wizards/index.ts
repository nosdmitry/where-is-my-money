export type WizardState =
  | { type: 'create-budget'; step: 'awaiting-total-limit' }
  | {
      type: 'create-category';
      step: 'awaiting-name' | 'awaiting-limit';
      name?: string;
    }
  | {
      type: 'add-expense';
      step: 'awaiting-amount' | 'awaiting-category' | 'awaiting-comment' | 'awaiting-confirmation';
      amount?: number;
      categoryId?: number;
      comment?: string | null;
      willExceed?: boolean;
    }
  | { type: 'edit-total-limit'; step: 'awaiting-limit' }
  | { type: 'rename-category'; step: 'awaiting-name'; categoryId: number }
  | { type: 'edit-category-limit'; step: 'awaiting-limit'; categoryId: number };

const states = new Map<number, WizardState>();

export function getWizard(telegramId: number): WizardState | undefined {
  return states.get(telegramId);
}

export function setWizard(telegramId: number, state: WizardState): void {
  states.set(telegramId, state);
}

export function clearWizard(telegramId: number): void {
  states.delete(telegramId);
}
