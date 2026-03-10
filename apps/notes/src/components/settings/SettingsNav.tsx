import type { ElementType } from 'react';
import { useTranslation } from 'react-i18next';

import type { SettingsSection } from '@/stores/settings.store';
import {
  Bell,
  FileEdit,
  Globe,
  Palette,
  Puzzle,
  Shield,
  User,
} from 'lucide-react';

import { cn } from '@knowtis/design-system';

const NAV_ITEMS: { section: SettingsSection; icon: ElementType }[] = [
  { section: 'profile', icon: User },
  { section: 'appearance', icon: Palette },
  { section: 'language', icon: Globe },
  { section: 'editor', icon: FileEdit },
  { section: 'notifications', icon: Bell },
  { section: 'integrations', icon: Puzzle },
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
    <nav
      className={cn(
        'shrink-0',
        'flex overflow-x-auto border-b border-(--border) px-2 sm:w-44 sm:flex-col sm:overflow-x-visible sm:border-b-0 sm:border-r sm:px-0 sm:py-2'
      )}
    >
      {NAV_ITEMS.map(({ section, icon: Icon }) => (
        <button
          key={section}
          type="button"
          onClick={() => onSectionChange(section)}
          aria-label={t(`settings.sections.${section}`)}
          className={cn(
            'flex items-center gap-2 whitespace-nowrap px-4 py-2 text-sm transition-colors',
            'sm:w-full',
            activeSection === section
              ? 'border-b-2 border-(--primary) font-medium text-(--foreground) sm:border-b-0 sm:bg-(--muted)'
              : 'text-(--muted-foreground) hover:text-(--foreground) sm:hover:bg-(--muted)/50'
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">
            {t(`settings.sections.${section}`)}
          </span>
        </button>
      ))}
    </nav>
  );
}
