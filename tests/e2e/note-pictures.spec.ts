// BR-22 · FR-TCH-22 · FR-STU-12 (M9): a teacher adds pictures to the lesson note by choosing a file or dropping
// one in, sizes and captions them; students see them as captioned figures; a picture taken out is deleted.
import { expect, test } from '@playwright/test';
import { teachingClass, type TeachingClass } from './fixtures';
import { stateFile } from './global-setup';
import { expectAccessible, watchProblems } from './helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const WEEK = 10;

test.describe.configure({ mode: 'serial' });
let c: TeachingClass;
let kept = '';
let removed = '';
test.beforeAll(async () => {
  c = await teachingClass();
});

test.describe('teacher', () => {
  test.use({ storageState: stateFile('teacher') });

  test('adds a picture from a file and drops in another, sizes and captions one, removes the other', async ({ page }) => {
    const problems = await watchProblems(page);
    await page.goto(`/teacher/classes/${c.classId}/weeks/${WEEK}`);
    await page.getByLabel('Title').fill('Pictures');
    const doc = page.getByRole('textbox', { name: 'Lesson note' });
    await doc.click();
    await page.keyboard.type('What you should see:');

    // A new lesson is saved as a draft first, so the picture has a lesson to belong to.
    await page.getByLabel('Choose a picture').setInputFiles({ name: 'output.png', mimeType: 'image/png', buffer: PNG });
    const pictures = doc.locator('.pic-edit img');
    await expect(pictures).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Publish' }).getByText('Draft', { exact: true })).toBeVisible();

    await doc.evaluate(
      (el, bytes) => {
        const data = new DataTransfer();
        data.items.add(new File([new Uint8Array(bytes)], 'second.png', { type: 'image/png' }));
        const r = el.getBoundingClientRect();
        el.dispatchEvent(
          new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: r.left + 30, clientY: r.top + 20 }),
        );
      },
      [...PNG],
    );
    await expect(pictures).toHaveCount(2);
    const srcs = await pictures.evaluateAll((imgs) => imgs.map((i) => i.getAttribute('src')!));
    [kept, removed] = srcs.map((s) => s.split('/').pop()!) as [string, string];
    const first = doc.locator('.pic-edit').filter({ has: page.locator(`img[src$="${kept}"]`) });
    const second = doc.locator('.pic-edit').filter({ has: page.locator(`img[src$="${removed}"]`) });

    await first.hover();
    await first.getByRole('group', { name: 'Picture size' }).getByRole('button', { name: 'Small' }).click();
    await first.getByRole('textbox', { name: /^Caption/ }).fill('The output window');
    await expectAccessible(page);
    await second.hover();
    await second.getByRole('button', { name: 'Remove picture' }).click();
    await expect(pictures).toHaveCount(1);

    await page.getByRole('region', { name: 'Publish' }).getByRole('button', { name: 'Publish now' }).click();
    await expect(page.getByRole('status')).toContainText('Lesson published');
    // In the note, not in the files to download.
    await expect(page.getByRole('region', { name: 'Files' }).getByRole('list', { name: 'Lesson files' })).toHaveCount(0);
    // Taken out of the note, so deleted when it was published.
    expect((await page.request.get(`/api/files/${removed}`)).status()).toBe(404);
    expect(await problems.cspViolations()).toEqual([]);
    expect(problems.consoleErrors).toEqual([]);
  });
});

test.describe('student', () => {
  test.use({ storageState: stateFile('student') });

  test('sees the picture as a small figure with its caption', async ({ page }) => {
    await page.goto(`/student/classes/${c.classId}/weeks/${WEEK}`);
    const figure = page.getByRole('article', { name: 'Lesson note' }).getByRole('figure', { name: 'The output window' });
    await expect(figure).toHaveClass('pic pic-small');
    const img = figure.locator('img');
    await expect(img).toHaveAttribute('src', `/api/files/${kept}`);
    expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1);
    await expect(page.getByRole('list', { name: 'Lesson files' })).toHaveCount(0);
    await expectAccessible(page);
  });
});
