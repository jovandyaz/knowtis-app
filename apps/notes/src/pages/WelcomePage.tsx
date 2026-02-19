import { Link } from '@tanstack/react-router';

import { useAuthUser } from '@jovandyaz/auth-react';
import { FileText, Layers } from 'lucide-react';

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@knowtis/design-system';

export function WelcomePage() {
  const user = useAuthUser();
  const firstName = user?.name?.split(' ')[0] ?? '';

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-(--foreground)">
          Welcome back{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="mt-2 text-(--muted-foreground)">
          What would you like to work on today?
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/notes" className="block group">
          <Card className="h-full transition-all hover:shadow-md hover:border-(--primary)/30 cursor-pointer">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-(--primary)/10">
                  <FileText className="h-5 w-5 text-(--primary)" />
                </div>
                <CardTitle className="text-lg">Notes</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Create, edit, and collaborate on notes in real-time.
              </CardDescription>
            </CardContent>
          </Card>
        </Link>

        <div className="block opacity-60 cursor-not-allowed">
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-(--muted)">
                  <Layers className="h-5 w-5 text-(--muted-foreground)" />
                </div>
                <CardTitle className="text-lg">Flashcards</CardTitle>
                <Badge variant="secondary">Coming soon</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Study with smart flashcards and spaced repetition.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
