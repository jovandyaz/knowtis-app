import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthStore, useAuthUser } from '@jovandyaz/auth-react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';

import {
  UpdateProfileSchema,
  useUpdateProfile,
} from '@knowtis/data-access-users';
import { Button, Input } from '@knowtis/design-system';
import { getInitials } from '@knowtis/shared-util';

type ProfileFormData = z.infer<typeof UpdateProfileSchema>;

function UserAvatar({ name }: { name: string }) {
  const initials = getInitials(name);
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-(--primary) text-xl font-semibold text-(--primary-foreground)">
      {initials || '?'}
    </div>
  );
}

export function ProfileSection() {
  const { t } = useTranslation('notes');
  const user = useAuthUser();
  const store = useAuthStore();
  const setUser = store((state) => state.setUser);
  const updateProfile = useUpdateProfile();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(UpdateProfileSchema),
    defaultValues: { name: user?.name ?? '' },
  });

  const onSubmit = (data: ProfileFormData) => {
    updateProfile.mutate(data, {
      onSuccess: (response) => {
        // The response type is a strict subset of the stored profile, so a
        // wholesale replace would drop the fields it never carries.
        setUser({ ...user, ...response.user });
        toast.success(t('profile.updatedToast'));
        reset(data);
      },
      onError: (error: Error) => {
        toast.error(error.message);
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <UserAvatar name={user?.name ?? ''} />
        <div>
          <p className="font-medium text-(--foreground)">{user?.name}</p>
          <p className="text-sm text-(--muted-foreground)">{user?.email}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="settings-name"
            className="text-sm font-medium text-(--foreground)"
          >
            {t('profile.nameLabel')}
          </label>
          <Input
            id="settings-name"
            type="text"
            placeholder={t('profile.namePlaceholder')}
            autoComplete="name"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'settings-name-error' : undefined}
            {...register('name')}
          />
          {errors.name && (
            <p
              id="settings-name-error"
              role="alert"
              className="text-sm text-(--destructive)"
            >
              {errors.name.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label
            htmlFor="settings-email"
            className="text-sm font-medium text-(--foreground)"
          >
            {t('profile.emailLabel')}
          </label>
          <Input
            id="settings-email"
            type="email"
            value={user?.email ?? ''}
            readOnly
            disabled
            className="text-(--muted-foreground)"
          />
        </div>

        <Button type="submit" disabled={!isDirty || updateProfile.isPending}>
          {updateProfile.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('profile.saving')}
            </>
          ) : (
            t('profile.saveChanges')
          )}
        </Button>
      </form>
    </div>
  );
}
