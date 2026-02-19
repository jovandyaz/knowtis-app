import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthStore, useAuthUser } from '@jovandyaz/auth-react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import type { UpdateProfileInput } from '@knowtis/data-access-users';
import {
  UpdateProfileSchema,
  useUpdateProfile,
} from '@knowtis/data-access-users';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from '@knowtis/design-system';
import { getInitials } from '@knowtis/shared-util';

function UserAvatar({ name }: { name: string }) {
  const initials = getInitials(name);

  return (
    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-(--primary) text-2xl font-semibold text-(--primary-foreground)">
      {initials || '?'}
    </div>
  );
}

export function ProfilePage() {
  const user = useAuthUser();
  const store = useAuthStore();
  const setUser = store((state) => state.setUser);
  const updateProfile = useUpdateProfile();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(UpdateProfileSchema),
    defaultValues: {
      name: user?.name ?? '',
    },
  });

  const onSubmit = (data: UpdateProfileInput) => {
    updateProfile.mutate(data, {
      onSuccess: (response) => {
        setUser(response.user);
        toast.success('Profile updated');
        reset(data);
      },
      onError: (error: Error) => {
        toast.error(
          error instanceof Error ? error.message : 'Failed to update profile'
        );
      },
    });
  };

  return (
    <div className="flex items-start justify-center p-4 pt-12">
      <Card className="w-full max-w-md border-border/50 bg-card/95 backdrop-blur-sm">
        <CardHeader className="space-y-4 text-center">
          <UserAvatar name={user?.name ?? ''} />
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold tracking-tight">
              Profile
            </CardTitle>
            <CardDescription>Manage your account information</CardDescription>
          </div>
        </CardHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label
                htmlFor="name"
                className="text-sm font-medium text-(--foreground)"
              >
                Name
              </label>
              <Input
                id="name"
                type="text"
                placeholder="Your name"
                autoComplete="name"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'name-error' : undefined}
                {...register('name')}
              />
              {errors.name && (
                <p
                  id="name-error"
                  role="alert"
                  className="text-sm text-(--destructive)"
                >
                  {errors.name.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label
                htmlFor="email"
                className="text-sm font-medium text-(--foreground)"
              >
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={user?.email ?? ''}
                readOnly
                disabled
                className="text-(--muted-foreground)"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={!isDirty || updateProfile.isPending}
            >
              {updateProfile.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save changes'
              )}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
