import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

// Status is never shown by colour alone: a pill always has a text label, and an icon for good/warn/bad.
export function Pill({
  tone = 'neutral',
  icon,
  children,
}: {
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info';
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <span className={`pill ${tone}`}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}
