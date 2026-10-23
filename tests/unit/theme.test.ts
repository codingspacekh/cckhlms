// Dark mode comes from the device's setting or from the top bar switch, so globals.css holds the dark tokens twice
// (a media query can't share a rule with a selector). The two copies must stay the same.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isTheme } from '@/components/shell/theme';

const css = readFileSync('src/app/globals.css', 'utf8');
const tokens = (block: string) => block.match(/--[\w-]+:\s*[^;]+;|color-scheme:\s*\w+;/g) ?? [];
const after = (marker: string) => {
  const start = css.indexOf(marker);
  expect(start, marker).toBeGreaterThan(-1);
  return css.slice(start + marker.length, css.indexOf('}', start));
};

describe('dark theme tokens', () => {
  it('are the same for the device setting and for the switch', () => {
    const device = tokens(after(":root:not([data-theme='light']) {"));
    const picked = tokens(after(":root[data-theme='dark'] {"));
    expect(device.length).toBeGreaterThan(20);
    expect(picked).toEqual(device);
  });

  it('only a light or dark cookie picks a theme', () => {
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('light')).toBe(true);
    for (const v of [undefined, '', 'Dark', 'blue', 'dark;x']) expect(isTheme(v)).toBe(false);
  });
});
