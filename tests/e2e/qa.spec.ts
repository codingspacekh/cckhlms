// FR-STU-03/04/10 · FR-TCH-03 · BR-20: the student asks about the lesson, a classmate replies, the teacher
// marks the answer; a reported post is hidden until the teacher reviews it.
import { expect, test, type Browser } from '@playwright/test';
import { E2E } from '../../playwright.config';
import { CLASSMATE, teachingClass, type TeachingClass } from './fixtures';
import { stateFile, USERS } from './global-setup';
import { expectAccessible, watchProblems, writeNote } from './helpers';

test.describe.configure({ mode: 'serial' });
let c: TeachingClass;
const WEEK = 7;
const as = async (browser: Browser, who: string) =>
  (
    await browser.newContext({ storageState: stateFile(who), baseURL: E2E.lms, permissions: ['clipboard-read', 'clipboard-write'] })
  ).newPage();

test.beforeAll(async ({ browser }) => {
  c = await teachingClass();
  const page = await as(browser, 'teacher');
  await page.goto(`/teacher/classes/${c.classId}/weeks/${WEEK}`);
  const form = page.getByRole('form', { name: 'Lesson note' });
  await form.getByLabel('Title').fill('Lists');
  await writeNote(page, 'Lists keep many values: `[1, 2, 3]`.');
  await page.getByRole('region', { name: 'Publish' }).getByRole('button', { name: 'Publish now' }).click();
  await expect(page.getByRole('status').first()).toContainText('Lesson published');
  await page.context().close();
});

// M12: the question is written in the compact editor, with its code in a code block (prototype boards 3–4).
test('the student reads the lesson and asks a question with code', async ({ browser }) => {
  const page = await as(browser, 'student');
  const problems = await watchProblems(page);
  await page.goto(`/student/classes/${c.classId}/weeks/${WEEK}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Lists' })).toBeVisible();
  const ask = page.getByRole('form', { name: 'Ask a question' });
  await expect(ask.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Code block' })).toBeVisible();
  await writeNote(
    page,
    'How do I add to a list? <img src=x onerror=alert(1)>\n\n```python\nnums = [1, 2]\nnums.add(3)\n```',
    'Your question',
  );
  await ask.getByRole('button', { name: 'Post question' }).click();
  const q = page.getByRole('article', { name: `Question from ${USERS.student.name}` });
  await expect(q).toContainText('How do I add to a list? <img src=x onerror=alert(1)>');
  await expect(q.locator('.code-block .code-lang')).toHaveText('Python');
  await expect(q.locator('.code-block code')).toHaveText('nums = [1, 2]\nnums.add(3)');
  await q.getByRole('button', { name: 'Copy' }).click();
  await expect(q.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('nums = [1, 2]\nnums.add(3)');
  await expect(page.getByRole('textbox', { name: 'Your question', exact: true })).toHaveText('');
  await expectAccessible(page);
  expect(await problems.cspViolations()).toEqual([]);
  await page.context().close();
});

test('a classmate replies, and the teacher marks it as the answer', async ({ browser }) => {
  const mate = await as(browser, 'classmate');
  await mate.goto(`/student/classes/${c.classId}/weeks/${WEEK}`);
  const q = mate.getByRole('article', { name: `Question from ${USERS.student.name}` });
  await q.getByRole('button', { name: `Write a reply to ${USERS.student.name}` }).click();
  await writeNote(mate, 'Use `append`:\n\n```python\nnums.append(3)\n```', `Your reply to ${USERS.student.name}`);
  await q.getByRole('button', { name: 'Reply' }).click();
  const answer = q.getByRole('listitem', { name: `Reply from ${CLASSMATE}` });
  await expect(answer.locator('code').first()).toHaveText('append');
  await expect(answer.locator('.code-block code')).toHaveText('nums.append(3)');
  await mate.context().close();

  const teacher = await as(browser, 'teacher');
  await teacher.goto(`/teacher/classes/${c.classId}/weeks/${WEEK}`);
  await teacher.getByRole('link', { name: 'Questions' }).click();
  const tq = teacher.getByRole('article', { name: `Question from ${USERS.student.name}` });
  const reply = tq.getByRole('listitem', { name: `Reply from ${CLASSMATE}` });
  await reply.getByRole('button', { name: 'Mark as answer' }).click();
  await expect(reply.getByText('Answer', { exact: true })).toBeVisible();
  await expectAccessible(teacher);
  await teacher.context().close();

  const student = await as(browser, 'student');
  await student.goto(`/student/classes/${c.classId}/weeks/${WEEK}`);
  await expect(student.getByRole('listitem', { name: `Reply from ${CLASSMATE}` }).getByText('Answer', { exact: true })).toBeVisible();
  await student.context().close();
});

test('a reported question is hidden from classmates, “under review” for its author, until the teacher restores it', async ({ browser }) => {
  const mate = await as(browser, 'classmate');
  await mate.goto(`/student/classes/${c.classId}/weeks/${WEEK}`);
  await mate.getByRole('button', { name: `Report question from ${USERS.student.name}` }).click();
  const dialog = mate.getByRole('dialog', { name: 'Report this question' });
  await dialog.getByLabel('Reason (optional)').fill('Testing the report button');
  await dialog.getByRole('button', { name: 'Report' }).click();
  await expect(mate.getByRole('article', { name: `Question from ${USERS.student.name}` })).toHaveCount(0);
  await mate.context().close();

  const author = await as(browser, 'student');
  await author.goto(`/student/classes/${c.classId}/weeks/${WEEK}`);
  await expect(author.getByRole('article', { name: `Question from ${USERS.student.name}` })).toContainText('Under review');
  await author.context().close();

  const teacher = await as(browser, 'teacher');
  await teacher.goto(`/teacher/classes/${c.classId}`);
  await teacher.getByRole('table', { name: 'Weeks' }).getByRole('link', { name: '1 to review' }).click();
  const tq = teacher.getByRole('article', { name: `Question from ${USERS.student.name}` });
  await expect(tq).toContainText(`Reported by ${CLASSMATE} (“Testing the report button”)`);
  await tq.getByRole('button', { name: 'Restore' }).first().click();
  await expect(tq.getByText('Under review')).toHaveCount(0);
  await teacher.context().close();

  const back = await as(browser, 'classmate');
  await back.goto(`/student/classes/${c.classId}/weeks/${WEEK}`);
  await expect(back.getByRole('article', { name: `Question from ${USERS.student.name}` })).toBeVisible();
  await back.context().close();
});
