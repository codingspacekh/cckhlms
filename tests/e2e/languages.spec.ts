// M18a · BR-32: Admin adds a language such as Roblox (prototype screen 1) and a course taught in it (screen 2).
import { expect, test } from '@playwright/test';
import { stateFile } from './global-setup';
import { choose, expectAccessible } from './helpers';

test.use({ storageState: stateFile('admin') });

test('Admin adds Roblox under Courses → Languages, then a Roblox course', async ({ page }) => {
  await page.goto('/admin/courses');
  await page.getByRole('navigation', { name: 'Courses and languages' }).getByRole('link', { name: 'Languages' }).click();
  await expect(page.getByRole('table', { name: 'Languages' }).getByRole('row', { name: /Python/ })).toContainText('Comes with the LMS');
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Add language' }).click();
  const form = page.getByRole('form', { name: 'Add a language' });
  await form.getByLabel('Name').fill('Roblox');
  await expect(form.getByRole('checkbox', { name: /A project file/ })).toBeChecked();
  await form.getByLabel(/File types/).fill('.rbxl, .rbxlx');
  await form.getByRole('checkbox', { name: /A link to their project/ }).check();
  await form.getByLabel(/From these sites/).fill('roblox.com');
  await expectAccessible(page);
  await form.getByRole('button', { name: 'Add language' }).click();
  await expect(page.getByRole('status')).toHaveText('Roblox added.');
  const row = page.getByRole('row', { name: /Roblox/ });
  await expect(row).toContainText('File · .rbxl, .rbxlx');
  await expect(row).toContainText('or link · roblox.com');

  await page.getByRole('navigation', { name: 'Courses and languages' }).getByRole('link', { name: 'Courses' }).click();
  await page.getByRole('button', { name: 'Add a course' }).click();
  const course = page.getByRole('form', { name: 'Add a course' });
  await course.getByLabel('Code').fill('RB1');
  await course.getByLabel('Course name').fill('Roblox Level 1');
  await choose(course.getByLabel('Language'), { label: 'Roblox' });
  await course.getByRole('button', { name: 'Add course' }).click();
  await expect(page.getByRole('row', { name: /RB1/ })).toContainText('Roblox');

  // In use now, so it can't be deleted.
  await page.goto('/admin/courses/languages');
  await page.getByRole('button', { name: 'Edit Roblox' }).click();
  await page.getByRole('button', { name: 'Delete Roblox' }).click();
  await expect(page.getByRole('form', { name: 'Edit Roblox' }).getByRole('alert')).toHaveText(
    'Roblox is used by 1 course, so it can’t be deleted.',
  );
});
