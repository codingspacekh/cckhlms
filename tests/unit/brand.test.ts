// The club look (M8, NFR-08): every text colour is readable on the backgrounds it sits on, in light and dark, worked
// out from the tokens in globals.css rather than eyeballed; the root layout loads Titillium Web; the logo ships.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/app/globals.css', 'utf8');

function block(marker: string) {
  const start = css.indexOf(marker);
  expect(start, marker).toBeGreaterThan(-1);
  return css.slice(start + marker.length, css.indexOf('}', start));
}
const tokensOf = (text: string) =>
  Object.fromEntries([...text.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()])) as Record<string, string>;

const light = tokensOf(block(':root {'));
const dark = { ...light, ...tokensOf(block(":root[data-theme='dark'] {")) };

// WCAG 2.1 relative luminance and contrast ratio, for #rrggbb colours.
function luminance(hex: string) {
  expect(hex, `${hex} is a #rrggbb colour`).toMatch(/^#[0-9a-f]{6}$/i);
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

const SURFACES = ['--page', '--surface', '--surface-2'];
const TEXT = ['--ink', '--ink-2', '--muted', '--heading', '--accent', '--good-text', '--warn-text', '--bad-text'];
const CODE = [
  '--code-keyword',
  '--code-string',
  '--code-number',
  '--code-comment',
  '--code-def',
  '--code-type',
  '--code-tag',
  '--code-attr',
];
// Text on a tinted or filled background: [text, background].
const PAIRS = [
  ['--accent-ink', '--accent'],
  ['--accent', '--accent-soft'],
  ['--ink', '--accent-soft'],
  ['--good-text', '--good-soft'],
  ['--warn-text', '--warn-soft'],
  ['--bad-text', '--bad-soft'],
  ['--ink', '--warn-soft'],
  ['--green-text', '--green-soft'],
  ['--pink-text', '--pink-soft'],
  ['--on-green', '--green'],
  ['--on-pink', '--pink'],
  ['--side-ink', '--side'],
  ['--side-muted', '--side'],
  ['--side-ink', '--side-2'],
  ['--side-active-ink', '--side-active'],
  ['--hero-ink', '--hero'],
  ['--hero-muted', '--hero'],
  ['--hero-ink', '--hero-2'],
  ['--hero-muted', '--hero-2'],
];

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme', (_name, t) => {
  it.each(TEXT.flatMap((text) => SURFACES.map((bg) => [text, bg])))('%s on %s passes 4.5:1', (text, bg) => {
    expect(contrast(t[text]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(CODE)('%s on --surface passes 4.5:1', (text) => {
    expect(contrast(t[text]!, t['--surface']!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(PAIRS)('%s on %s passes 4.5:1', (text, bg) => {
    expect(contrast(t[text!]!, t[bg!]!)).toBeGreaterThanOrEqual(4.5);
  });

  it('chart series stand out from the chart surface (3:1)', () => {
    for (const s of ['--s1', '--s2']) expect(contrast(t[s]!, t['--surface']!)).toBeGreaterThanOrEqual(3);
  });
});

describe('brand', () => {
  it('uses the club colours: dark blue sidebar, the logo blue for actions', () => {
    expect(light['--side']).toBe('#152a5c');
    expect(light['--accent']).toBe('#0a5aa0');
    expect(light['--green']).toBe('#79b843');
    expect(light['--pink']).toBe('#e5195e');
  });

  it('sets Titillium Web as the text font, from files in the repo (no request to Google)', () => {
    const layout = readFileSync('src/app/layout.tsx', 'utf8');
    expect(layout).toMatch(/from 'next\/font\/local'/);
    expect(layout).not.toMatch(/next\/font\/google/);
    for (const w of [400, 600, 700]) {
      expect(layout).toContain(`titillium-web-latin-${w}-normal.woff2`);
      expect(existsSync(`src/app/fonts/titillium-web-latin-${w}-normal.woff2`)).toBe(true);
    }
    expect(existsSync('src/app/fonts/TitilliumWeb-OFL.txt')).toBe(true);
    expect(light['--f']).toMatch(/^var\(--font-titillium\)/);
  });

  it('uses only the weights the font has (400, 600, 700)', () => {
    const weights = new Set([...css.matchAll(/font-weight:\s*(\d+)/g), ...css.matchAll(/font:\s*(\d{3})\s/g)].map((m) => m[1]));
    expect([...weights].sort()).toEqual(['400', '600', '700']);
  });

  it('ships the Champion Coders logo', () => {
    expect(existsSync('src/components/shell/champion-coders-logo.png')).toBe(true);
  });
});
