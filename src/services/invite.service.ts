import { randomBytes } from 'node:crypto';
import { and, eq, isNull, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { households, invites, memberships, type Invite } from '../db/schema.js';
import { INVITE_TTL_HOURS } from '../domain/constants.js';
import {
  ConflictError,
  InviteAlreadyUsedError,
  InviteExpiredError,
  NotFoundError,
  PermissionError,
} from '../domain/errors.js';
import { getHouseholdById, getMembershipByUserId, isHouseholdEmpty } from './household.service.js';

const TOKEN_BYTES = 16;

function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

export function getInviteByToken(token: string): Invite | null {
  return db.select().from(invites).where(eq(invites.token, token)).get() ?? null;
}

/**
 * Создаёт инвайт от имени админа household.
 * Возвращает токен и срок действия.
 */
export function createInvite(
  householdId: number,
  requestingUserId: number,
): { token: string; expiresAt: Date } {
  const membership = getMembershipByUserId(requestingUserId);
  if (!membership || membership.householdId !== householdId) {
    throw new PermissionError();
  }
  if (membership.role !== 'admin') {
    throw new PermissionError('Приглашать может только администратор');
  }

  const household = getHouseholdById(householdId);
  if (!household) throw new NotFoundError('Household', householdId);
  if (household.status !== 'active') {
    throw new ConflictError('Бюджет закрыт');
  }

  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

  const invite = db
    .insert(invites)
    .values({
      householdId,
      token: generateToken(),
      role: 'member',
      expiresAt,
    })
    .returning()
    .get();

  return { token: invite.token, expiresAt: invite.expiresAt };
}

export type AcceptInviteResult = {
  householdId: number;
  replacedHouseholdId: number | null;
};

/**
 * Принимает инвайт от имени пользователя.
 * Если у пользователя есть пустой household — он удаляется.
 * Если непустой — отказ.
 */
export function acceptInvite(token: string, userId: number): AcceptInviteResult {
  const invite = getInviteByToken(token);
  if (!invite) throw new NotFoundError('Invite');
  if (invite.usedByUserId !== null) throw new InviteAlreadyUsedError();
  if (invite.expiresAt.getTime() < Date.now()) throw new InviteExpiredError();

  const household = getHouseholdById(invite.householdId);
  if (!household) throw new NotFoundError('Household', invite.householdId);
  if (household.status !== 'active') {
    throw new ConflictError('Бюджет закрыт');
  }

  const existing = getMembershipByUserId(userId);
  let replacedHouseholdId: number | null = null;

  if (existing) {
    if (existing.householdId === invite.householdId) {
      throw new ConflictError('Вы уже участвуете в этом бюджете');
    }
    if (!isHouseholdEmpty(existing.householdId)) {
      throw new ConflictError(
        'Вы уже участвуете в другом бюджете с данными. Покиньте его, чтобы присоединиться.',
      );
    }
    replacedHouseholdId = existing.householdId;
  }

  return db.transaction((tx) => {
    tx.update(invites)
      .set({ usedByUserId: userId, usedAt: new Date() })
      .where(eq(invites.id, invite.id))
      .run();

    if (replacedHouseholdId !== null) {
      tx.delete(memberships).where(eq(memberships.userId, userId)).run();
      tx.delete(households).where(eq(households.id, replacedHouseholdId)).run();
    }

    const newMembership = tx
      .insert(memberships)
      .values({
        userId,
        householdId: invite.householdId,
        role: 'member',
      })
      .returning()
      .get();

    return {
      householdId: newMembership.householdId,
      replacedHouseholdId,
    };
  });
}

/**
 * Удаляет все просроченные и неиспользованные инвайты.
 * Вызывать периодически (например, раз в час).
 */
export function cleanupExpiredInvites(): number {
  const result = db
    .delete(invites)
    .where(and(isNull(invites.usedByUserId), lt(invites.expiresAt, new Date())))
    .run();
  return result.changes;
}
