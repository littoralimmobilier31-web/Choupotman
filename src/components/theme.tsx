'use client';

import * as React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Theme handling.
 *
 * The stored preference is applied by a tiny blocking script in `<head>` before
 * first paint, which is the only reliable way to avoid a light flash on a dark
 * theme. React then takes over for the toggle. Everything is wrapped in
 * try/catch because `localStorage` throws in private windows and when site data
 * is blocked — the page must still render.
 */

const STORAGE_KEY = 'chp-theme';
export type ThemeChoice = 'light' | 'dark' | 'system';

const SCRIPT = `(function(){try{
var stored=localStorage.getItem('${STORAGE_KEY}');
var dark=stored==='dark'||(stored!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.classList.toggle('dark',dark);
document.documentElement.style.colorScheme=dark?'dark':'light';
}catch(e){}})();`;

export function ThemeScript() {
  // eslint-disable-next-line react/no-danger
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}

function applyTheme(choice: ThemeChoice): void {
  const dark =
    choice === 'dark' ||
    (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export function useTheme(): { theme: ThemeChoice; setTheme: (choice: ThemeChoice) => void } {
  const [theme, setThemeState] = React.useState<ThemeChoice>('system');

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') setThemeState(stored);
    } catch {
      // Site data blocked — keep the system default.
    }
  }, []);

  // Follow the OS while the choice is "system".
  React.useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = React.useCallback((choice: ThemeChoice) => {
    setThemeState(choice);
    applyTheme(choice);
    try {
      if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // Preference simply won't persist; the page still works.
    }
  }, []);

  return { theme, setTheme };
}

const OPTIONS: { key: ThemeChoice; icon: React.ReactNode; label: string }[] = [
  { key: 'light', icon: <Sun className="size-3.5" />, label: 'Clair' },
  { key: 'dark', icon: <Moon className="size-3.5" />, label: 'Sombre' },
  { key: 'system', icon: <Monitor className="size-3.5" />, label: 'Système' },
];

export function ThemeToggle({
  className,
  labels,
}: {
  className?: string;
  labels?: { light: string; dark: string; system: string };
}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <div
      className={cn('inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-raised p-0.5', className)}
      role="radiogroup"
      aria-label="Thème"
    >
      {OPTIONS.map((option) => {
        const label = labels?.[option.key] ?? option.label;
        const active = mounted && theme === option.key;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(option.key)}
            className={cn(
              'inline-flex size-7 items-center justify-center rounded-md transition-colors',
              active ? 'bg-accent text-accent-fg' : 'text-fg-subtle hover:bg-surface-hover hover:text-fg',
            )}
          >
            {option.icon}
          </button>
        );
      })}
    </div>
  );
}
