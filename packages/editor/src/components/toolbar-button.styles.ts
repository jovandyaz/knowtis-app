import { cn } from '@knowtis/design-system';

const BASE = 'h-8 w-8 shrink-0 rounded-full p-0 transition-all';
const ACTIVE = 'bg-foreground text-background hover:bg-foreground/90';
const IDLE = 'text-muted-foreground hover:bg-muted hover:text-foreground';

export function toolbarButtonClasses(isActive: boolean, className?: string) {
  return cn(BASE, isActive ? ACTIVE : IDLE, className);
}
