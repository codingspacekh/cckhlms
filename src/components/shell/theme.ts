// Shared by the root layout (server) and the top bar switch (browser).
export const THEME_COOKIE = 'theme';
export type Theme = 'light' | 'dark';
export const isTheme = (v: string | undefined): v is Theme => v === 'light' || v === 'dark';
