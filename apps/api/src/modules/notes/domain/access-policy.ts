import type {
  GeneralAccessLevel,
  PermissionLevel,
} from '@knowtis/shared-types';

export interface AccessSnapshot {
  readonly ownerId: string;
  readonly generalAccess: GeneralAccessLevel;
  readonly generalAccessPermission: PermissionLevel;
  readonly shareTokenFingerprint: string | null;
  readonly directPermissions: ReadonlyArray<{
    readonly userId: string;
    readonly permission: PermissionLevel;
  }>;
}
export interface SessionIdentity {
  readonly userId: string;
  readonly suppliedTokenFingerprint: string | null;
}
export type EffectiveAccess = 'none' | 'viewer' | 'editor' | 'owner';
export function resolveEffectiveAccess(
  snapshot: AccessSnapshot | null,
  identity: SessionIdentity
): EffectiveAccess {
  if (!snapshot) {
    return 'none';
  }
  if (snapshot.ownerId === identity.userId) {
    return 'owner';
  }
  const direct = snapshot.directPermissions.find(
    (entry) => entry.userId === identity.userId
  )?.permission;
  const link =
    snapshot.generalAccess === 'anyone_with_link' &&
    snapshot.shareTokenFingerprint !== null &&
    identity.suppliedTokenFingerprint === snapshot.shareTokenFingerprint
      ? snapshot.generalAccessPermission
      : undefined;
  if (direct === 'editor' || link === 'editor') {
    return 'editor';
  }
  return direct === 'viewer' || link === 'viewer' ? 'viewer' : 'none';
}

export function canManagePeople(
  note: { readonly ownerId: string; readonly editorsCanShare: boolean },
  actorId: string,
  directPermission: PermissionLevel | null
): boolean {
  return (
    note.ownerId === actorId ||
    (note.editorsCanShare && directPermission === 'editor')
  );
}

export function canChangePerson(
  targetId: string,
  ownerId: string,
  actorId: string
): boolean {
  return targetId !== ownerId && targetId !== actorId;
}

export function isEligibleRecipient<
  T extends { readonly id: string; readonly isAnonymous: boolean },
>(target: T | null, ownerId: string, actorId: string): target is T {
  return (
    target !== null &&
    !target.isAnonymous &&
    canChangePerson(target.id, ownerId, actorId)
  );
}

export function isPermissionWidening(
  current: PermissionLevel | null,
  requested: PermissionLevel
): boolean {
  return current === null || (current === 'viewer' && requested === 'editor');
}
