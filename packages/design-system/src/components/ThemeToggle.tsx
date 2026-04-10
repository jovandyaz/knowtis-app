import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { THEMES, type Theme } from '../constants/theme';
import { Button } from './Button';

/**
 * Theme toggle props interface
 * @property {Theme} theme - The theme to display
 * @property {(newTheme: Theme) => void} onToggle - The function to call when the theme is toggled
 */
export interface ThemeToggleProps {
  theme?: Theme;
  onToggle?: (newTheme: Theme) => void;
}

export function ThemeToggle({
  theme: controlledTheme,
  onToggle,
}: ThemeToggleProps = {}) {
  const { theme: contextTheme, setTheme } = useTheme();

  const isControlled = controlledTheme !== undefined;
  const currentTheme = isControlled ? controlledTheme : contextTheme;

  const handleToggle = () => {
    const newTheme = currentTheme === THEMES.LIGHT ? THEMES.DARK : THEMES.LIGHT;
    if (isControlled && onToggle) {
      onToggle(newTheme);
    } else {
      setTheme(newTheme);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      className="relative rounded-full w-9 h-9 overflow-hidden transition-all hover:bg-accent"
      title="Toggle theme"
    >
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
