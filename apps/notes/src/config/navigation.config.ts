import type { LinkProps } from '@tanstack/react-router';

import type { LucideIcon } from 'lucide-react';
import { Home, Search } from 'lucide-react';

import type { FileRouteTypes } from '../routeTree.gen';

/**
 * Type-safe navigation link configuration
 * @property {LucideIcon} icon - The icon to display
 * @property {string} label - The label to display
 * @property {FileRouteTypes['to']} to - The route to navigate to
 * @property {Omit<LinkProps, 'to' | 'children'>} linkProps - Additional link props
 * @property {boolean} disabled - Whether the link is disabled
 * @property {string} tooltip - Tooltip text to display on hover
 */
export interface NavigationLink {
  icon: LucideIcon;
  label: string;
  to: FileRouteTypes['to'];
  linkProps?: Omit<LinkProps, 'to' | 'children'>;
  disabled?: boolean;
  tooltip?: string;
}

/**
 * Main navigation links configuration
 */
export const NAVIGATION_LINKS: NavigationLink[] = [
  {
    icon: Home,
    label: 'Home',
    to: '/',
  },
  {
    icon: Search,
    label: 'Search',
    to: '/',
    disabled: true,
    tooltip: 'Coming soon',
  },
] as const satisfies NavigationLink[];
