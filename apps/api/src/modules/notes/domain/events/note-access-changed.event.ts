export class NoteAccessChangedEvent {
  static readonly EVENT_NAME = 'note.access-changed';
  readonly occurredOn = new Date();
  constructor(public readonly noteId: string) {}
}
