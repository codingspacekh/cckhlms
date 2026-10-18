import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tile } from '@/components/ui/Tile';

afterEach(cleanup);

describe('PageHeader', () => {
  it('shows the title as the page heading, with optional eyebrow and actions', () => {
    render(<PageHeader eyebrow="Term 4 · 2026" title="Classes" actions={<button>New class</button>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Classes' })).toBeTruthy();
    expect(screen.getByText('Term 4 · 2026')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New class' })).toBeTruthy();
  });
  it('renders just the title when nothing else is given', () => {
    const { container } = render(<PageHeader title="Dashboard" />);
    expect(container.querySelector('.eyebrow')).toBeNull();
    expect(container.querySelector('.row')).toBeNull();
  });
});

describe('Tile', () => {
  it('shows a label, a value and an optional note', () => {
    const { container } = render(<Tile label="Students" value={12} note="1 joined late" />);
    expect(container.querySelector('.k')?.textContent).toBe('Students');
    expect(container.querySelector('.v')?.textContent).toBe('12');
    expect(container.querySelector('.s')?.textContent).toBe('1 joined late');
  });
  it('leaves out the note when there is none', () => {
    const { container } = render(<Tile label="Admins" value={1} />);
    expect(container.querySelector('.s')).toBeNull();
  });
});
