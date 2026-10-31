// M14c · FR-ADM-18, FR-STU-13, BR-29: Admin ticks two flagged students on Weekly reports and makes a support line;
// a student sees it on My week with Join on Zoom, and their teacher on Today.
import { expect, test } from '@playwright/test';
import { todayIn } from '../../src/modules/academics/schedule';
import { flaggedStudents } from './fixtures';
import { stateFile } from './global-setup';
import { choose, expectAccessible } from './helpers';

const ZOOM = 'https://us06web.zoom.us/j/89990001112?pwd=U3VwcG9ydA';
const tomorrow = new Date(new Date(`${todayIn('Asia/Phnom_Penh')}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
let termId = '';
let week = 0;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ termId, week } = await flaggedStudents());
});

test.describe('Admin', () => {
  test.use({ storageState: stateFile('admin') });

  test('makes a support line for the students ticked on Weekly reports', async ({ page }) => {
    await page.goto(`/admin/weekly-reports?term=${termId}&week=${week}`);
    const support = page.getByRole('region', { name: 'Needs support this week' });
    await expect(support.getByRole('checkbox', { name: 'Leakena Som' })).toBeChecked();
    await expect(support.getByRole('checkbox', { name: 'Rotanak Ry' })).toBeChecked();
    await support.getByRole('button', { name: 'Add ticked students to a support line' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Support lines' })).toBeVisible();
    const form = page.getByRole('form', { name: 'New support line' });
    const students = form.getByRole('table', { name: 'Students in this support line' });
    await expect(students.getByRole('rowheader')).toHaveText(['Leakena Som', 'Rotanak Ry']);
    await expect(students).toContainText('Missed the loops lesson.');
    await expect(form.getByTestId('teachers-told')).toHaveText('Sophea Chan');
    // Removed by mistake, then found again by typing part of the name: Enter adds the only match.
    await students.getByRole('button', { name: 'Remove Rotanak Ry' }).click();
    const finder = form.getByRole('region', { name: 'Add students' });
    await finder.getByLabel('Find a student').fill('rotan');
    await expect(finder.getByRole('button', { name: /^Add / })).toHaveCount(1);
    await expectAccessible(page);
    await finder.getByLabel('Find a student').press('Enter');
    await expect(students.getByRole('rowheader')).toHaveText(['Leakena Som', 'Rotanak Ry']);
    await form.getByLabel('Support line Zoom link').fill(ZOOM);
    await form.getByLabel('Day').fill(tomorrow);
    await form.getByLabel('Start time').fill('18:00');
    await choose(form.getByLabel('Length'), '60');
    await form.getByLabel(/Message to students/).fill('Bring your Week 3 program.');
    await expectAccessible(page);
    await form.getByRole('button', { name: 'Create and send' }).click();

    await expect(page.getByRole('status')).toContainText('2 students and 1 teacher (Sophea Chan) can see it now');
    const list = page.getByRole('table', { name: 'Support lines' });
    await expect(list.getByRole('row', { name: /Leakena Som, Rotanak Ry/ })).toContainText('Upcoming');
    await expectAccessible(page);
  });
});

test.describe('its student', () => {
  test.use({ storageState: stateFile('leakena') });

  test('sees it on My week with Join on Zoom', async ({ page }) => {
    await page.goto('/student');
    const card = page.getByRole('region', { name: 'You’re invited to an extra help session' });
    await expect(card).toContainText('18:00–19:00');
    await expect(card).toContainText('Bring your Week 3 program.');
    await expect(card).not.toContainText('Rotanak');
    await expect(card.getByRole('link', { name: /Join on Zoom/ })).toHaveAttribute('href', ZOOM);
    await expectAccessible(page);
  });
});

test.describe('their teacher', () => {
  test.use({ storageState: stateFile('teacher') });

  test('sees it on Today, with their own students', async ({ page }) => {
    await page.goto('/teacher');
    const card = page.getByRole('region', { name: '2 of your students have a support line' });
    await expect(card.getByRole('rowheader')).toHaveText(['Leakena Som', 'Rotanak Ry']);
    await expect(card.getByRole('link', { name: /Join on Zoom/ })).toHaveAttribute('href', ZOOM);
    await expectAccessible(page);
  });
});
