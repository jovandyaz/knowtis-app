import type { ElementType } from 'react';
import { useTranslation } from 'react-i18next';

import type { SettingsSection } from '@/stores/settings.store';
import { Bell, FileEdit, Globe, Palette, Shield, User } from 'lucide-react';

import { cn } from '@knowtis/design-system';

const NAV_ITEMS: { section: SettingsSection; icon: ElementType }[] = [
  { section: 'profile', icon: User },
  { section: 'appearance', icon: Palette },
  { section: 'language', icon: Globe },
  { section: 'editor', icon: FileEdit },
  { section: 'notifications', icon: Bell },
  { section: 'account', icon: Shield },
];

interface SettingsNavProps {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
}

export function SettingsNav({
  activeSection,
  onSectionChange,
}: SettingsNavProps) {
  const { t } = useTranslation('common');

  return (
    <nav className="w-44 shrink-0 border-r border-(--border) py-2">
      {NAV_ITEMS.map(({ section, icon: Icon }) => (
        <button
          key={section}
          type="button"
          onClick={() => onSectionChange(section)}
          className={cn(
            'flex w-full items-center gap-2.5 px-4 py-2 text-sm transition-colors',
            activeSection === section
              ? 'bg-(--muted) font-medium text-(--foreground)'
              : 'text-(--muted-foreground) hover:bg-(--muted)/50 hover:text-(--foreground)'
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {t(`settings.sections.${section}`)}
        </button>
      ))}
    </nav>
  );
}
