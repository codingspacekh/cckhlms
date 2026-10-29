'use client';
// Date and time fields with the club's own calendar and time list instead of the browser's pickers. People can
// also type ('8/1/2028', '2pm'). The form gets 'YYYY-MM-DD' / 'HH:MM' under `name` from a hidden input, as the
// browser's date and time inputs sent. Before the page's JavaScript runs, the browser's own input stands in, so
// plain GET forms (the audit log filters) still work without it.
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { addDays, formatDate } from '@/modules/academics/schedule';
import { dayLabel, monthDays, monthTitle, parseDateText, parseTimeText, shiftMonth, TIME_STEPS } from '@/lib/date-pick';

type FieldProps = {
  label: string;
  name: string;
  value?: string; // controlled
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  form?: string;
  autoFocus?: boolean;
};

type PanelProps = { value: string; required: boolean; focusOnOpen: boolean; pick: (value: string) => void };

type Kind = {
  type: 'date' | 'time';
  parse: (text: string) => string | null;
  show: (value: string) => string;
  placeholder: string;
  invalid: string;
  icon: IconName;
  open: string;
  title: string;
  Panel: (p: PanelProps) => ReactNode;
};

const DATE: Kind = {
  type: 'date',
  parse: parseDateText,
  show: formatDate,
  placeholder: 'Choose a date',
  invalid: 'Type a date like 8 Jan 2028, or choose one from the calendar.',
  icon: 'calendar',
  open: 'Open calendar',
  title: 'Choose a date',
  Panel: Calendar,
};
const TIME: Kind = {
  type: 'time',
  parse: parseTimeText,
  show: (t) => t,
  placeholder: 'Choose a time',
  invalid: 'Type a time like 14:30, or choose one from the list.',
  icon: 'clock',
  open: 'Open time list',
  title: 'Choose a time',
  Panel: TimeList,
};

export const DateField = (p: FieldProps) => <PickField kind={DATE} {...p} />;
export const TimeField = (p: FieldProps) => <PickField kind={TIME} {...p} />;

const noSubscribe = () => () => {};
// Older browsers (and the test DOM) without the Popover API get a plain fixed box instead of the top layer.
const canPop = () => 'showPopover' in HTMLElement.prototype;

function PickField({
  kind,
  label,
  name,
  value: controlled,
  defaultValue = '',
  onChange,
  required = false,
  form,
  autoFocus,
}: FieldProps & { kind: Kind }) {
  const id = useId();
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;
  const [text, setText] = useState(() => (value ? kind.show(value) : ''));
  const [shownFor, setShownFor] = useState(value);
  const [open, setOpen] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  // A new value from outside (controlled, or picked) shows in words, unless it is what is being typed.
  if (value !== shownFor) {
    setShownFor(value);
    if (kind.parse(text) !== value) setText(value ? kind.show(value) : '');
  }
  const invalid = text.trim() !== '' && kind.parse(text) === null;

  useEffect(() => input.current?.setCustomValidity(invalid ? kind.invalid : ''), [invalid, kind, hydrated]);

  // React resets a form after its action succeeds; go back to the first value like the browser's inputs do.
  useEffect(() => {
    const f = hidden.current?.form;
    if (!f || controlled !== undefined) return;
    const reset = () => {
      setOwn(defaultValue);
      setText(defaultValue ? kind.show(defaultValue) : '');
    };
    f.addEventListener('reset', reset);
    return () => f.removeEventListener('reset', reset);
  }, [controlled, defaultValue, kind, hydrated]);

  // The list opens in the top layer (above a modal dialog), next to the field; a click elsewhere closes it.
  useLayoutEffect(() => {
    const p = pop.current;
    if (!open || !p) return;
    if (p.popover) p.showPopover();
    const place = () => {
      const r = wrap.current!.getBoundingClientRect();
      const h = p.offsetHeight;
      const below = r.bottom + 6 + h <= window.innerHeight || r.top - 6 - h < 0;
      p.style.top = `${below ? r.bottom + 6 : r.top - 6 - h}px`;
      p.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - p.offsetWidth - 8))}px`;
      p.style.setProperty('--field-w', `${r.width}px`);
    };
    place();
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!wrap.current?.contains(t) && !p.contains(t)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  if (!hydrated) {
    return (
      <div className="f">
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          type={kind.type}
          name={name}
          form={form}
          required={required}
          {...(controlled === undefined ? { defaultValue } : { value: controlled, readOnly: true })}
        />
      </div>
    );
  }

  function commit(v: string) {
    if (controlled === undefined) setOwn(v);
    onChange?.(v);
  }
  function type(t: string) {
    setText(t);
    const v = kind.parse(t);
    if (v) commit(v);
    else if (t.trim() === '') commit('');
  }
  function show(inside: boolean) {
    setFocusInside(inside);
    setOpen(true);
  }
  function close() {
    setOpen(false);
    input.current?.focus();
  }
  function pick(v: string) {
    commit(v);
    setText(v ? kind.show(v) : '');
    close();
  }
  function keys(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      e.preventDefault(); // not the modal dialog around it
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown' && !open && e.target === input.current) {
      e.preventDefault();
      show(true);
    }
  }

  return (
    <div className="f">
      <label htmlFor={id}>{label}</label>
      <div className={`pick ${open ? 'open' : ''}`} ref={wrap} onKeyDown={keys}>
        <input
          ref={input}
          id={id}
          type="text"
          role="combobox"
          form={form}
          value={text}
          placeholder={kind.placeholder}
          required={required}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={invalid || undefined}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? `${id}-pop` : undefined}
          onChange={(e) => type(e.target.value)}
          onPointerDown={(e) => {
            // A tap on a phone opens the calendar or list without the on-screen keyboard covering it.
            if (e.pointerType !== 'touch') return;
            e.preventDefault();
            if (!open) show(true);
          }}
          onClick={() => !open && show(false)}
          onBlur={() => !invalid && value && setText(kind.show(value))}
        />
        <button type="button" className="pick-btn" aria-label={kind.open} tabIndex={-1} onClick={() => (open ? close() : show(true))}>
          <Icon name={kind.icon} />
        </button>
        <input ref={hidden} type="hidden" name={name} form={form} value={value} />
      </div>
      {open && (
        <div
          ref={pop}
          id={`${id}-pop`}
          popover={canPop() ? 'manual' : undefined}
          className={`pop ${kind.type}`}
          role="dialog"
          aria-label={kind.title}
          onKeyDown={keys}
          onBlur={(e) => {
            const to = e.relatedTarget as Node | null;
            if (to && !pop.current?.contains(to) && !wrap.current?.contains(to)) setOpen(false);
          }}
        >
          <kind.Panel value={value} required={required} focusOnOpen={focusInside} pick={pick} />
        </div>
      )}
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const WEEK_HEAD = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DAY_KEYS: Record<string, (d: string) => string> = {
  ArrowLeft: (d) => addDays(d, -1),
  ArrowRight: (d) => addDays(d, 1),
  ArrowUp: (d) => addDays(d, -7),
  ArrowDown: (d) => addDays(d, 7),
  PageUp: (d) => sameDayIn(d, -1),
  PageDown: (d) => sameDayIn(d, 1),
  Home: (d) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7)),
  End: (d) => addDays(d, 6 - ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7)),
};
// The same day of the month a month away, or that month's last day (31 Jan → 29 Feb).
function sameDayIn(date: string, by: number) {
  const month = shiftMonth(date.slice(0, 7), by);
  const last = monthDays(month)
    .filter((d) => d.inMonth)
    .at(-1)!.date;
  return `${month}-${date.slice(8)}` > last ? last : `${month}-${date.slice(8)}`;
}

function Calendar({ value, required, focusOnOpen, pick }: PanelProps) {
  const today = localToday();
  const [focused, setFocused] = useState(value || today);
  const [month, setMonth] = useState((value || today).slice(0, 7));
  const grid = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(focusOnOpen);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
  }, [focused, month]);

  function go(e: KeyboardEvent) {
    const next = DAY_KEYS[e.key]?.(focused);
    if (!next) return;
    e.preventDefault();
    moveFocus.current = true;
    setFocused(next);
    setMonth(next.slice(0, 7));
  }
  const tabbable = focused.startsWith(month) ? focused : `${month}-01`;

  return (
    <div className="cal">
      <div className="cal-head">
        <button type="button" className="cal-nav" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
          <Icon name="chevron-left" />
        </button>
        <span className="cal-title" aria-live="polite">
          {monthTitle(month)}
        </span>
        <button type="button" className="cal-nav" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>
          <Icon name="chevron-right" />
        </button>
      </div>
      <div className="cal-grid" ref={grid} onKeyDown={go}>
        {WEEK_HEAD.map((w) => (
          <span key={w} className="cal-wd" aria-hidden="true">
            {w}
          </span>
        ))}
        {monthDays(month).map(({ date, inMonth }) => (
          <button
            key={date}
            type="button"
            data-date={date}
            className={`cal-day${inMonth ? '' : ' out'}${date === today ? ' today' : ''}`}
            aria-label={dayLabel(date)}
            aria-pressed={date === value}
            aria-current={date === today ? 'date' : undefined}
            tabIndex={date === tabbable ? 0 : -1}
            onClick={() => pick(date)}
          >
            {Number(date.slice(8))}
          </button>
        ))}
      </div>
      <div className="cal-foot">
        <button type="button" className="btn sm ghost" onClick={() => pick(today)}>
          Today
        </button>
        {!required && (
          <button type="button" className="btn sm ghost" onClick={() => pick('')}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function TimeList({ value, focusOnOpen, pick }: PanelProps) {
  const list = useRef<HTMLDivElement>(null);
  const times = value && !TIME_STEPS.includes(value) ? [...TIME_STEPS, value].sort() : TIME_STEPS;
  // Without a time yet, start the list at the morning rather than midnight.
  const start = value || '09:00';

  // After the pop-up is shown (the parent shows it in its own layout effect), so the list has a height to scroll in.
  useEffect(() => {
    const l = list.current!;
    const b = l.querySelector<HTMLButtonElement>(`[data-time="${start}"]`);
    if (!b) return;
    l.scrollTop = b.offsetTop - l.clientHeight / 2 + b.offsetHeight / 2;
    if (focusOnOpen) b.focus({ preventScroll: true });
  }, [start, focusOnOpen]);

  function go(e: KeyboardEvent) {
    const b = e.target as HTMLElement;
    const next =
      e.key === 'ArrowDown'
        ? b.nextElementSibling
        : e.key === 'ArrowUp'
          ? b.previousElementSibling
          : e.key === 'Home'
            ? list.current!.firstElementChild
            : e.key === 'End'
              ? list.current!.lastElementChild
              : null;
    if (!(next instanceof HTMLElement)) return;
    e.preventDefault();
    next.focus();
  }

  return (
    <div className="times" ref={list} onKeyDown={go}>
      {times.map((t) => (
        <button
          key={t}
          type="button"
          data-time={t}
          className="time-opt"
          aria-pressed={t === value}
          tabIndex={t === start ? 0 : -1}
          onClick={() => pick(t)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
