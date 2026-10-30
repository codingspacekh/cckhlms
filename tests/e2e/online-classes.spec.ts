// M14a · FR-ADM-05, FR-STU-13, BR-28: Admin makes a class online with its Zoom link, and its student joins from
// My week and the class page.
import { expect, test } from '@playwright/test';
import { onlineClass } from './fixtures';
import { stateFile } from './global-setup';
import { expectAccessible } from './helpers';

const ZOOM = 'https://us06web.zoom.us/j/81234567890?pwd=Qk1aWnNw';
let classId = '';

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ classId } = await onlineClass());
});

test.describe('Admin', () => {
  test.use({ storageState: stateFile('admin') });

  test('makes a class online with its Zoom link', async ({ page }) => {
    await page.goto(`/admin/classes/${classId}`);
    await page.getByRole('button', { name: 'Edit class' }).click();
    const form = page.getByRole('form', { name: 'Edit class' });
    await form.getByRole('radio', { name: 'Online (Zoom)' }).check();
    await expect(form.getByLabel('Room', { exact: true })).toHaveCount(0);
    const link = form.getByLabel('Zoom link');
    await link.fill('zoom.us/j/81234567890');
    await link.blur();
    await expect(form.getByText('Paste the full link, starting with https://')).toBeVisible();
    await link.fill(ZOOM);
    await link.blur();
    await expect(form.getByText('Paste the full link, starting with https://')).toHaveCount(0);
    await expectAccessible(page);
    await form.getByRole('button', { name: 'Save class' }).click();
    await expect(page.getByRole('status')).toHaveText('Class saved.');

    const where = page.getByRole('link', { name: /Online · Zoom link/ });
    await expect(where).toHaveAttribute('href', ZOOM);
    await expect(where).toHaveAttribute('target', '_blank');
    await page.goto('/admin/classes');
    await expect(page.getByRole('row', { name: /Python Online · Sun 17:00/ })).toContainText('Online');
    await expectAccessible(page);
  });
});

test.describe('its student', () => {
  test.use({ storageState: stateFile('kosal') });

  test('presses Join on Zoom on My week and the class page', async ({ page }) => {
    await page.goto('/student');
    const hello = page.getByRole('region', { name: 'Hi Kosal!' });
    await expect(hello).toContainText('See you online with Teacher Rotha.');
    await expect(hello.getByRole('list', { name: 'Next class' })).toContainText('Online on Zoom');
    const join = hello.getByRole('link', { name: /Join on Zoom/ });
    await expect(join).toHaveAttribute('href', ZOOM);
    await expect(join).toHaveAttribute('rel', 'noopener noreferrer');
    await expectAccessible(page);

    // It opens in a new tab; the tab is stopped before it reaches Zoom.
    await page.context().route('https://us06web.zoom.us/**', (route) => route.fulfill({ body: 'Zoom' }));
    const [tab] = await Promise.all([page.waitForEvent('popup'), join.click()]);
    await expect(tab).toHaveURL(ZOOM);
    await tab.close();

    await page.goto(`/student/classes/${classId}`);
    await expect(page.getByRole('link', { name: /Join on Zoom/ })).toHaveAttribute('href', ZOOM);
    await expectAccessible(page);
  });
});

test.describe('a student of another class', () => {
  test.use({ storageState: stateFile('student') });

  test('never sees the link', async ({ page }) => {
    await page.goto('/student');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.content()).not.toContain('81234567890');
  });
});
