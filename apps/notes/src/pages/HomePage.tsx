import { NoteList } from '@/components/notes';

export function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-(--foreground)">My Notes</h1>
        <p className="mt-2 text-(--muted-foreground)">
          Create, edit, and collaborate on notes in real-time!
        </p>
      </div>

      <NoteList />
    </div>
  );
}
