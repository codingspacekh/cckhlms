// M3 exit journey (docs/05): a teacher runs one week end to end — lesson, attendance, Q&A and the weekly
// report — and the syllabus coverage view matches, for the teacher and the admin.
import { expect, test, type Browser } from '@playwright/test';
import { E2E } from '../../playwright.config';
import { CLASSMATE, rehearsalClass, type TeachingClass } from './fixtures';
import { stateFile, USERS } from './global-setup';
import { expectAccessible, writeNote } from './helpers';

test.describe.configure({ mode: 'serial' });
let c: TeachingClass;
const as = async (browser: Browser, who: string) =>
  (await browser.newContext({ storageState: stateFile(who), baseURL: E2E.lms })).newPage();
test.beforeAll(async () => {
  c = await rehearsalClass();
});

test('the teacher publishes week 2’s lesson and takes attendance', async ({ browser }) => {
  const page = await as(browser, 'teacher');
  await page.goto('/teacher');
  await page.getByRole('article', { name: c.className }).getByRole('link', { name: 'Open class' }).click();
  await page.getByRole('table', { name: 'Weeks' }).getByRole('link', { name: 'Week 2' }).click();
  const form = page.getByRole('form', { name: 'Lesson note' });
  await form.getByLabel('Title').fill('Links and images');
  await writeNote(page, '## Links\nUse `<a href="...">` to link pages.');
  await page.getByRole('checkbox', { name: 'Links and images' }).check();
  await page.getByRole('region', { name: 'Publish' }).getByRole('button', { name: 'Publish now' }).click();
  await expect(page.getByRole('status').first()).toContainText('Lesson published');

  await page.getByRole('link', { name: 'Attendance' }).click();
  await page.getByRole('radiogroup', { name: CLASSMATE }).getByText('Late').click();
  await expect(page.getByTestId('attendance-counts')).toHaveText('1 present · 1 late · 0 absent · 0 excused');
  await page.context().close();
});

test('the student reads it and asks; the classmate answers; the teacher marks the answer', async ({ browser }) => {
  const student = await as(browser, 'student');
  await student.goto('/student');
  await student.getByRole('link', { name: c.className }).click();
  await student.getByRole('link', { name: 'Week 2: Links and images' }).click();
  await expect(student.getByRole('article', { name: 'Lesson note' })).toContainText('to link pages');
  const ask = student.getByRole('form', { name: 'Ask a question' });
  await writeNote(student, 'How do I open a link in a new tab?', 'Your question');
  await ask.getByRole('button', { name: 'Post question' }).click();
  await expect(student.getByRole('article', { name: `Question from ${USERS.student.name}` })).toBeVisible();
  await student.context().close();

  const mate = await as(browser, 'classmate');
  await mate.goto(`/student/classes/${c.classId}/weeks/2`);
  const q = mate.getByRole('article', { name: `Question from ${USERS.student.name}` });
  await q.getByRole('button', { name: `Write a reply to ${USERS.student.name}` }).click();
  await writeNote(mate, 'Add `target="_blank"`.', `Your reply to ${USERS.student.name}`);
  await q.getByRole('button', { name: 'Reply' }).click();
  await expect(q.getByRole('listitem', { name: `Reply from ${CLASSMATE}` })).toBeVisible();
  await mate.context().close();

  const teacher = await as(browser, 'teacher');
  await teacher.goto(`/teacher/classes/${c.classId}/weeks/2/questions`);
  await teacher
    .getByRole('listitem', { name: `Reply from ${CLASSMATE}` })
    .getByRole('button', { name: 'Mark as answer' })
    .click();
  await expect(teacher.getByRole('listitem', { name: `Reply from ${CLASSMATE}` }).getByText('Answer', { exact: true })).toBeVisible();
  await teacher.context().close();
});

test('the teacher writes the weekly report; coverage matches for the teacher and the admin', async ({ browser }) => {
  const page = await as(browser, 'teacher');
  await page.goto(`/teacher/classes/${c.classId}`);
  await expect(page.getByRole('table', { name: 'Weeks' }).getByRole('row', { name: /Week 2/ })).toContainText('Missing');
  await page
    .getByRole('table', { name: 'Weeks' })
    .getByRole('row', { name: /Week 2/ })
    .getByRole('link', { name: 'Missing' })
    .click();
  const form = page.getByRole('form', { name: 'Weekly report' });
  await expect(form.getByTestId('report-attendance')).toContainText('1 present1 late0 absent0 excused');
  await expect(form.getByRole('checkbox', { name: 'Links and images' })).toBeChecked(); // from the lesson
  await form.getByRole('checkbox', { name: 'HTML tags' }).check();
  await form.getByLabel('Comment on the session').fill('Good week. Borey was late but caught up.');
  await expectAccessible(page);
  await form.getByRole('button', { name: 'Save weekly report' }).click();
  await expect(form.getByRole('status')).toHaveText('Weekly report saved.');

  await page.goto(`/teacher/classes/${c.classId}`);
  await expect(page.getByRole('table', { name: 'Weeks' }).getByRole('row', { name: /Week 2/ })).toContainText('Done');
  await page
    .getByRole('group', { name: `${c.className} sections` })
    .getByRole('link', { name: 'Syllabus' })
    .click();
  const coverage = page.getByRole('region', { name: 'Syllabus coverage' });
  await expect(coverage).toContainText('2 of 4 topics, from the weekly reports');
  await expect(coverage.getByRole('list', { name: 'Syllabus topics' })).toHaveText(
    /HTML tagsWeek 2Links and imagesWeek 2CSS coloursTo comeFlexboxTo come/,
  );
  await page.context().close();

  const admin = await as(browser, 'admin');
  await admin.goto(`/admin/classes/${c.classId}`);
  await expect(admin.getByRole('region', { name: 'Syllabus coverage' })).toContainText('2 of 4 topics');
  await admin.context().close();
});
