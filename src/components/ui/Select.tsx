'use client';
// The club's drop-down instead of the browser's (owner, 2026-10-29): a field that opens its own list, the same in every
// browser, in light and dark. It is written like <select>, with <option> and <optgroup> children, and the form gets the
// chosen value under `name` from a hidden input. It works like a select-only combobox: Enter, Space or the arrows
// open it; the arrows, Home and End move; typing jumps to an option; Enter picks; Escape closes. Before the page's
// JavaScript runs, the browser's own <select> stands in, so plain GET forms (the audit log filters) still work.
import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Icon } from '@/components/ui/Icon';

type Value = string | number;
type Props = {
  children: ReactNode;
  name?: string;
  id?: string;
  value?: Value; // controlled
  defaultValue?: Value;
  // Like a select's change event, so callers can keep `(e) => set(e.target.value)`.
  onChange?: (e: { target: { value: string } }) => void;
  required?: boolean;
  disabled?: boolean;
  form?: string;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
};
type Option = { value: string; label: string; disabled: boolean; group?: string };

const noSubscribe = () => () => {};
// Older browsers (and the test DOM) without the Popover API get a plain fixed box instead of the top layer.
const canPop = () => 'showPopover' in HTMLElement.prototype;

function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

// The <option>s, in order, with the <optgroup> each one is in.
function optionsOf(children: ReactNode, group?: string): Option[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child)) return [];
    const el = child as ReactElement<{ value?: Value; label?: string; disabled?: boolean; children?: ReactNode }>;
    if (el.type === Fragment) return optionsOf(el.props.children, group);
    if (el.type === 'optgroup') return optionsOf(el.props.children, el.props.label);
    if (el.type !== 'option') return [];
    const label = textOf(el.props.children);
    return [{ value: String(el.props.value ?? label), label, disabled: !!el.props.disabled, group }];
  });
}

export function Select({
  children,
  name,
  id,
  value: controlled,
  defaultValue,
  onChange,
  required,
  disabled,
  form,
  className,
  ...aria
}: Props) {
  const own = useId();
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const options = optionsOf(children);
  const first = String(defaultValue ?? options.find((o) => !o.disabled)?.value ?? '');
  const [mine, setMine] = useState(first);
  const value = controlled === undefined ? mine : String(controlled);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const listId = `${own}-list`;
  const fieldId = id ?? `${own}-field`;
  const chosen = options.find((o) => o.value === value);

  // React resets a form after its action succeeds; go back to the first value like a <select> does.
  useEffect(() => {
    const f = hidden.current?.form;
    if (!f || controlled !== undefined) return;
    const reset = () => setMine(first);
    f.addEventListener('reset', reset);
    return () => f.removeEventListener('reset', reset);
  }, [controlled, first, hydrated]);

  // The field's name is its label's words, without the chosen option's that sit inside the <label> too (a <select>
  // gets that from the browser). Set on the element, so React leaves it alone.
  const ariaLabel = aria['aria-label'];
  useLayoutEffect(() => {
    const b = button.current;
    if (!b || ariaLabel) return;
    const label = b.labels?.[0]; // a <label> around it, or one with for= its id
    if (!label) return;
    const words = label.cloneNode(true) as HTMLElement;
    words.querySelectorAll('.sel-wrap').forEach((n) => n.remove());
    const text = words.textContent?.replace(/\s+/g, ' ').trim();
    if (text) b.setAttribute('aria-label', text);
  }, [hydrated, ariaLabel]);

  // Like a required <select>, the form isn't sent while nothing is chosen: the list opens to choose from instead. This
  // runs before React's own submit handling, which listens further up.
  useEffect(() => {
    const f = hidden.current?.form;
    if (!f || !required) return;
    const check = (e: Event) => {
      if (value !== '') return;
      e.preventDefault();
      e.stopPropagation();
      button.current?.focus();
      setOpen(true);
    };
    f.addEventListener('submit', check, true);
    return () => f.removeEventListener('submit', check, true);
  }, [required, value, hydrated]);

  // The list opens in the top layer (above a modal dialog), under the field or above it if there's no room, and follows
  // it when the page scrolls; the chosen option is scrolled into view and focused. A click elsewhere closes it.
  useLayoutEffect(() => {
    const p = pop.current;
    if (!open || !p) return;
    if (p.popover) p.showPopover();
    const place = () => {
      const r = button.current!.getBoundingClientRect();
      p.style.setProperty('--field-w', `${r.width}px`);
      const h = p.offsetHeight;
      const below = r.bottom + 6 + h <= window.innerHeight || r.top - 6 - h < 0;
      p.style.top = `${below ? r.bottom + 6 : r.top - 6 - h}px`;
      p.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - p.offsetWidth - 8))}px`;
    };
    place();
    const items = [...p.querySelectorAll<HTMLElement>('[role=option]:not([aria-disabled=true])')];
    const start = items.find((o) => o.dataset.value === value) ?? items[0];
    start?.scrollIntoView?.({ block: 'nearest' });
    start?.focus({ preventScroll: true });
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!button.current?.contains(t) && !p.contains(t)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
    // Only when it opens: picking closes it, so `value` can't change while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!hydrated) {
    return (
      <select
        id={id}
        name={name}
        form={form}
        required={required}
        disabled={disabled}
        className={className}
        aria-label={aria['aria-label']}
        aria-describedby={aria['aria-describedby']}
        {...(controlled === undefined ? { defaultValue } : { value: controlled, onChange })}
      >
        {children}
      </select>
    );
  }

  function close() {
    setOpen(false);
    button.current?.focus();
  }
  function pick(o: Option) {
    if (o.disabled) return;
    if (o.value !== value) {
      if (controlled === undefined) setMine(o.value);
      onChange?.({ target: { value: o.value } });
    }
    close();
  }
  // Letters typed within a second make one word, as in the browser's lists.
  function match(key: string, after: number, now: number) {
    typed.current = { text: now - typed.current.at < 1000 ? typed.current.text + key : key, at: now };
    const t = typed.current.text.toLowerCase();
    const ok = options.map((o, i) => ({ o, i })).filter(({ o }) => !o.disabled && o.label.toLowerCase().startsWith(t));
    return (ok.find(({ i }) => i > after) ?? ok[0])?.o;
  }
  function onField(e: KeyboardEvent) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      setOpen(true);
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const o = match(
        e.key,
        options.findIndex((x) => x.value === value),
        e.timeStamp,
      );
      if (o) pick(o);
    }
  }
  function onList(e: KeyboardEvent) {
    const items = [...pop.current!.querySelectorAll<HTMLElement>('[role=option]:not([aria-disabled=true])')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const to = (i: number) => items[Math.max(0, Math.min(items.length - 1, i))]?.focus();
    const current = () => options.find((o) => o.value === (document.activeElement as HTMLElement).dataset.value);
    if (e.key === 'Escape') {
      e.preventDefault(); // not the modal dialog around it
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown') to(at + 1);
    else if (e.key === 'ArrowUp') to(at - 1);
    else if (e.key === 'Home' || e.key === 'PageUp') to(0);
    else if (e.key === 'End' || e.key === 'PageDown') to(items.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') {
      const o = current();
      if (o) pick(o);
    } else if (e.key === 'Tab') {
      setOpen(false);
      return; // let the focus move on
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const o = match(e.key, options.indexOf(current()!), e.timeStamp);
      if (o) items.find((i) => i.dataset.value === o.value)?.focus();
    } else return;
    e.preventDefault();
  }

  const option = (o: Option) => (
    <div
      key={`${o.group ?? ''}${o.value}`}
      role="option"
      className="sel-opt"
      data-value={o.value}
      tabIndex={o.disabled ? undefined : -1}
      aria-selected={o.value === value}
      aria-disabled={o.disabled || undefined}
      onClick={(e) => {
        e.preventDefault(); // inside a <label>: don't also click the field
        pick(o);
      }}
    >
      <span>{o.label}</span>
      {o.value === value && !o.disabled && <Icon name="check" />}
    </div>
  );
  // Runs of options in the same group, in the order they were written (an option after the groups stays last).
  const runs: { group?: string; options: Option[] }[] = [];
  for (const o of options) {
    const last = runs.at(-1);
    if (last && last.group === o.group) last.options.push(o);
    else runs.push({ group: o.group, options: [o] });
  }

  return (
    <span className={`sel-wrap ${className ?? ''}`}>
      <button
        ref={button}
        type="button"
        id={fieldId}
        role="combobox"
        className={`sel${chosen && !chosen.disabled ? '' : ' placeholder'}`}
        value={value}
        form={form}
        disabled={disabled}
        aria-label={aria['aria-label']}
        aria-describedby={aria['aria-describedby']}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-required={required || undefined}
        onClick={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
        onKeyDown={onField}
      >
        <span className="sel-text">{chosen?.label ?? ''}</span>
      </button>
      {name && <input ref={hidden} type="hidden" name={name} form={form} value={value} />}
      {open && (
        <div
          ref={pop}
          id={listId}
          popover={canPop() ? 'manual' : undefined}
          className="pop sel-list"
          role="listbox"
          aria-label="Choices"
          onKeyDown={onList}
          onClick={(e) => e.preventDefault()}
          onBlur={(e) => {
            const to = e.relatedTarget as Node | null;
            if (to && !pop.current?.contains(to) && to !== button.current) setOpen(false);
          }}
        >
          {runs.map((r, i) =>
            r.group === undefined ? (
              r.options.map(option)
            ) : (
              <div key={`${i}-${r.group}`} role="group" aria-label={r.group}>
                <div className="sel-group" aria-hidden="true">
                  {r.group}
                </div>
                {r.options.map(option)}
              </div>
            ),
          )}
        </div>
      )}
    </span>
  );
}
