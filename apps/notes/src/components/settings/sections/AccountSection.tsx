import { useTranslation } from 'react-i18next';

import { useNavigate } from '@tanstack/react-router';

import { useSettingsStore } from '@/stores/settings.store';
import { useLogout } from '@jovandyaz/auth-react';
import { LogOut } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@knowtis/design-system';

import { SectionHeader } from '../SectionHeader';

export function AccountSection() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const { mutate: logout } = useLogout();
  const close = useSettingsStore((s) => s.close);

  const handleLogout = () => {
    close();
    logout(undefined, {
      onSuccess: () => {
        toast.success(t('nav.signedOutSuccess'));
        navigate({ to: '/login', search: { redirect: undefined } });
      },
    });
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t('settings.sections.account')}
        description={t('settings.descriptions.account')}
      />

      <div className="space-y-4">
        <Button
          type="button"
          variant="destructive"
          onClick={handleLogout}
          className="gap-2"
        >
          <LogOut className="h-4 w-4" />
          {t('nav.logOut')}
        </Button>
      </div>
    </div>
  );
}
