'use client';
// The light/dark switch in the top bar. Pages follow the device's setting until someone picks a theme here; the
// pick is kept in a cookie, so the server renders every later page in it (no flash of the other theme).
import { useSyncExternalStore } from 'react';
import { Icon } from '@/components/ui/Icon';
import { THEME_COOKIE, type Theme } from './theme';

const DARK = '(prefers-color-scheme: dark)';
const CHANGED = 'themechange';

const shown = (): Theme => (document.documentElement.dataset.theme as Theme | undefined) ?? (matchMedia(DARK).matches ? 'dark' : 'light');

function subscribe(onChange: () => void) {
  const media = matchMedia(DARK);
  media.addEventListener('change', onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    media.removeEventListener('change', onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

function pick(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  const secure = location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${400 * 24 * 3600}; samesite=lax${secure}`;
  window.dispatchEvent(new Event(CHANGED));
}

export function ThemeSwitch() {
  // The server can't see the device's setting, so the label is generic until the page is running.
  const theme = useSyncExternalStore(subscribe, shown, () => null);
  const label = theme ? `Switch to the ${theme === 'dark' ? 'light' : 'dark'} theme` : 'Switch between light and dark';
  return (
    <button
      type="button"
      className="theme-switch"
      aria-label={label}
      title={label}
      onClick={() => pick(shown() === 'dark' ? 'light' : 'dark')}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}
