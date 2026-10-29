// For tests of forms that use the club's drop-down (src/components/ui/Select.tsx) instead of <select>.
import { fireEvent } from '@testing-library/react';

function listOf(field: HTMLElement) {
  if (field.getAttribute('aria-expanded') !== 'true') fireEvent.click(field);
  return document.getElementById(field.getAttribute('aria-controls')!)!;
}

// Picks the option with this value, as fireEvent.change did on a <select>.
export function pickOption(field: HTMLElement, value: string) {
  const option = [...listOf(field).querySelectorAll<HTMLElement>('[role=option]')].find((o) => o.dataset.value === value);
  if (!option) throw new Error(`no option ${value}`);
  fireEvent.click(option);
}

// The options as the list shows them, with their group (the <optgroup>) and whether they can be picked.
export function optionsOf(field: HTMLElement) {
  const list = listOf(field);
  const options = [...list.querySelectorAll<HTMLElement>('[role=option]')].map((o) => ({
    label: o.textContent ?? '',
    value: o.dataset.value ?? '',
    disabled: o.getAttribute('aria-disabled') === 'true',
    group: o.closest('[role=group]')?.getAttribute('aria-label') ?? null,
  }));
  fireEvent.click(field); // close it again
  return options;
}
