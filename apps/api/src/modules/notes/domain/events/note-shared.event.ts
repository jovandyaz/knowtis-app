import type { NoteShareType, PermissionLevel } from '@knowtis/shared-types';

export class NoteSharedEvent {
  static readonly EVENT_NAME = 'note.shared';

  constructor(
    public readonly actorId: string,
    public readonly shareType: NoteShareType,
    public readonly permission: PermissionLevel
  ) {}
}
