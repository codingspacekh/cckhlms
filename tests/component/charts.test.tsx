// FR-TCH-18 · FR-STU-07 · FR-ADM-09: the chart kit, built to the dataviz rules from P0. Each card's table view shows
// exactly the values it plots; tooltips show on hover and on keyboard focus, as text only; a legend appears for two
// or more series.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BarListCard, ColumnCard, LineCard, Meter, Sparkline } from '@/components/charts';

afterEach(cleanup);

const plotted = (container: HTMLElement) => [...container.querySelectorAll('[data-value]')].map((e) => e.getAttribute('data-value'));
const tableRows = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((r) => [...r.querySelectorAll('th, td')].map((c) => c.textContent));

describe('ColumnCard', () => {
  const items = [
    { label: 'Week 1 · Sat 9 Jan', short: 'Week 1', value: 75 },
    { label: 'Week 2 · Sat 16 Jan', short: 'Week 2', value: 50 },
    { label: 'Week 3 · Sat 23 Jan', short: 'Week 3', value: 0 },
  ];

  it('plots every value and shows the same values in its table view', () => {
    const { container } = render(
      <ColumnCard title="Attendance by week" subtitle="Present or late" items={items} unit="%" valueHead="Attendance" />,
    );
    expect(screen.getByRole('heading', { name: 'Attendance by week' })).toBeTruthy();
    expect(plotted(container)).toEqual(['75', '50', '0']);
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.getByRole('button', { name: 'Table' }).getAttribute('aria-pressed')).toBe('true');
    expect(tableRows()).toEqual([
      ['Week 1 · Sat 9 Jan', '75%'],
      ['Week 2 · Sat 16 Jan', '50%'],
      ['Week 3 · Sat 23 Jan', '0%'],
    ]);
    expect(screen.getByRole('columnheader', { name: 'Attendance' })).toBeTruthy();
  });

  it('shows a tooltip on hover and on keyboard focus, with the value first', () => {
    render(<ColumnCard title="Attendance by week" items={items} unit="%" valueHead="Attendance" />);
    const mark = screen.getByRole('img', { name: 'Week 2 · Sat 16 Jan: 50%' });
    fireEvent.pointerMove(mark, { clientX: 10, clientY: 10 });
    expect(screen.getByRole('tooltip').textContent).toBe('Week 2 · Sat 16 Jan50%Attendance');
    fireEvent.pointerLeave(mark);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(screen.getByRole('img', { name: 'Week 1 · Sat 9 Jan: 75%' }));
    expect(screen.getByRole('tooltip').textContent).toContain('75%');
    fireEvent.blur(screen.getByRole('img', { name: 'Week 1 · Sat 9 Jan: 75%' }));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('puts labels in as text, never as HTML', () => {
    const evil = '<img src=x onerror="alert(1)">';
    const { container } = render(<ColumnCard title="t" items={[{ label: evil, value: 10 }]} unit="%" valueHead="v" />);
    fireEvent.pointerMove(screen.getByRole('img', { name: `${evil}: 10%` }), { clientX: 1, clientY: 1 });
    expect(screen.getByRole('tooltip').textContent).toContain(evil);
    expect(container.querySelector('img')).toBeNull();
  });

  it('says so when there is nothing to plot yet', () => {
    render(<ColumnCard title="Attendance by week" items={[]} unit="%" valueHead="Attendance" empty="No attendance taken yet." />);
    expect(screen.getByText('No attendance taken yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Table' })).toBeNull();
  });
});

describe('BarListCard', () => {
  it('labels every bar with its value, marks the pass mark, and has the same table', () => {
    const items = [
      { label: 'Loops quiz', sub: 'Classwork', value: 62.5 },
      { label: 'Countdown', sub: 'Homework', value: 81 },
    ];
    const { container } = render(
      <BarListCard title="Average score by task" items={items} unit="%" valueHead="Average" refValue={60} refLabel="Pass mark 60" />,
    );
    expect(plotted(container)).toEqual(['62.5', '81']);
    expect(screen.getByText('62.5%')).toBeTruthy();
    expect(container.querySelectorAll('.tick')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(tableRows()).toEqual([
      ['Loops quiz (Classwork)', '62.5%'],
      ['Countdown (Homework)', '81%'],
    ]);
  });
});

describe('LineCard', () => {
  const mine = {
    name: 'Bopha',
    points: [
      { label: 'Task 1', full: 'Loops quiz', value: 80 },
      { label: 'Task 2', full: 'Countdown', value: 90 },
    ],
  };
  const avg = {
    name: 'Class average',
    points: [
      { label: 'Task 1', full: 'Loops quiz', value: 70 },
      { label: 'Task 2', full: 'Countdown', value: 65.5 },
    ],
  };

  it('has a legend for two series, and its table lists every series at every point', () => {
    const { container } = render(
      <LineCard title="My scores by task" series={[mine, avg]} unit="%" refValue={60} refLabel="Pass mark 60" />,
    );
    expect(within(container.querySelector('.legend') as HTMLElement).getAllByText(/Bopha|Class average/)).toHaveLength(2);
    expect(plotted(container)).toEqual(['80', '90', '70', '65.5']);
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Point', 'Bopha', 'Class average']);
    expect(tableRows()).toEqual([
      ['Loops quiz', '80%', '70%'],
      ['Countdown', '90%', '65.5%'],
    ]);
  });

  it('a hover band shows every series at that point', () => {
    render(<LineCard title="My scores by task" series={[mine, avg]} unit="%" />);
    fireEvent.pointerMove(screen.getByRole('img', { name: 'Countdown: Bopha 90%, Class average 65.5%' }), { clientX: 5, clientY: 5 });
    expect(screen.getByRole('tooltip').textContent).toBe('Countdown90%Bopha65.5%Class average');
  });

  it('has no legend box for a single series: the title names it', () => {
    const { container } = render(<LineCard title="Class average by week" series={[avg]} unit="%" />);
    expect(container.querySelector('.legend')).toBeNull();
  });
});

describe('Meter and Sparkline', () => {
  it('a meter says the score and the pass mark in words, and shows below-pass in colour and text', () => {
    const { rerender } = render(<Meter value={72.5} passMark={60} />);
    expect(screen.getByRole('img', { name: '72.5 out of 100, pass mark 60' }).querySelector('i')!.className).toBe('');
    rerender(<Meter value={55} passMark={60} />);
    expect(screen.getByRole('img', { name: '55.0 out of 100, pass mark 60' }).querySelector('i')!.className).toBe('warn');
    rerender(<Meter value={40} passMark={60} />);
    expect(screen.getByRole('img').querySelector('i')!.className).toBe('bad');
  });
  it('a sparkline needs two points and is hidden from screen readers (its numbers are shown beside it)', () => {
    const { container, rerender } = render(<Sparkline values={[80]} />);
    expect(container.querySelector('svg')).toBeNull();
    rerender(<Sparkline values={[80, 90, 85]} />);
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });
});
