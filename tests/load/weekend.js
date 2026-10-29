// k6 load test (M7, NFR-01/03): a Saturday morning at 3× the club's weekend peak (~150 → 450 people). Students
// sign in, open their home, class, lesson and homework pages, and type: the editor autosaves every few seconds
// (the saveDraftAction Server Action, called the way the browser calls it). Teachers open their class, the
// gradebook and the attendance sheet. Locally each person comes from their own address, as behind Cloudflare.
// Run by tests/load/run.sh; it fails on any threshold below.
/* global __ENV */ // k6 sets __ENV; open() is k6’s too
import exec from 'k6/execution';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const BASE = __ENV.BASE ?? 'http://lms.localhost:3000';
const data = JSON.parse(open('/load/out/data.json'));
const SAVE_DRAFT = __ENV.SAVE_DRAFT_ACTION;
const PEOPLE = Number(__ENV.STUDENTS ?? 435);
const TEACHERS = Number(__ENV.TEACHERS ?? 15);
const HOLD = __ENV.HOLD ?? '5m';
// Through Cloudflare (tests/load/live.sh) everyone comes from the laptop's one address, which the sign-in limit
// (src/server/auth.ts) holds back, so the live run brings people in more slowly.
const RAMP = __ENV.RAMP ?? '2m';

// A valid session treated as signed out (post-M5 review: seen once under heavy CPU load).
const signedOut = new Counter('signed_out');

const stages = (n) => [
  { duration: RAMP, target: n },
  { duration: HOLD, target: n },
  { duration: '30s', target: 0 },
];
export const options = {
  scenarios: {
    students: { executor: 'ramping-vus', exec: 'student', stages: stages(PEOPLE), gracefulRampDown: '90s', gracefulStop: '90s' },
    teachers: { executor: 'ramping-vus', exec: 'teacher', stages: stages(TEACHERS), gracefulRampDown: '90s', gracefulStop: '90s' },
  },
  thresholds: {
    'http_req_duration{kind:page}': ['p(95)<500'],
    'http_req_duration{kind:save}': ['p(95)<500'],
    'http_req_duration{kind:sign_in}': ['p(95)<1500'], // a password hash, once per person
    http_req_failed: ['rate==0'],
    checks: ['rate==1'],
    signed_out: ['count==0'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  noCookiesReset: true, // each person signs in once and keeps their session, like a browser
};

// Per virtual user: who they are, their address, and whether they've signed in.
let me = null;
const ip = () => `10.${(exec.vu.idInTest >> 16) & 255}.${(exec.vu.idInTest >> 8) & 255}.${exec.vu.idInTest & 255}`;
// Locally the app trusts this header as each person's address. Cloudflare refuses requests that already carry it
// (403, error 1000), and sets it itself, so the live run leaves it out.
const from = () => (BASE.startsWith('https://') ? {} : { 'cf-connecting-ip': ip() });
const think = (min, max) => sleep(min + Math.random() * (max - min));

function signIn(username) {
  const res = http.post(`${BASE}/api/auth/sign-in/username`, JSON.stringify({ username, password: `load-password-${username}` }), {
    headers: { 'content-type': 'application/json', origin: BASE, ...from() },
    tags: { kind: 'sign_in', name: 'sign in' },
  });
  check(res, { 'signed in': (r) => r.status === 200 });
}

function page(path, name) {
  const res = http.get(`${BASE}${path}`, { headers: from(), redirects: 0, tags: { kind: 'page', name } });
  if (res.status === 307 && (res.headers.Location ?? '').includes('/login')) signedOut.add(1);
  check(res, { [`${name}: 200`]: (r) => r.status === 200 });
}

function saveDraft(s, n) {
  const files = [{ path: 'main.py', content: `# Times table, try ${n}\nfor i in range(1, 11):\n    print(i, "x 7 =", i * 7)\n` }];
  const res = http.post(`${BASE}/student/classes/${s.classId}/work/${s.workId}`, JSON.stringify([s.workId, files]), {
    headers: {
      accept: 'text/x-component',
      'content-type': 'text/plain;charset=UTF-8',
      'next-action': SAVE_DRAFT,
      origin: BASE,
      ...from(),
    },
    redirects: 0,
    tags: { kind: 'save', name: 'autosave' },
  });
  if (res.status === 303 || (res.status === 307 && (res.headers.Location ?? '').includes('/login'))) signedOut.add(1);
  const saved = check(res, { 'autosave: saved': (r) => r.status === 200 && r.body.includes('"ok":true') });
  if (!saved) console.warn(`autosave failed for ${s.username}: ${res.status} ${res.error || String(res.body).slice(0, 300)}`);
}

export function student() {
  if (!me) {
    me = data.students[(exec.vu.idInTest - 1) % data.students.length];
    signIn(me.username);
  }
  page('/student', 'student home');
  think(2, 5);
  page(`/student/classes/${me.classId}`, 'class');
  think(2, 5);
  page(`/student/classes/${me.classId}/weeks/2`, 'lesson');
  think(10, 20); // reading the notes
  page(`/student/classes/${me.classId}/work/${me.workId}`, 'homework');
  for (let n = 0; n < 6; n++) {
    think(4, 6); // typing; the editor saves a few seconds after each change
    saveDraft(me, n);
  }
}

export function teacher() {
  if (!me) {
    me = data.teachers[(exec.vu.idInTest - 1) % data.teachers.length];
    signIn(me.username);
  }
  page('/teacher', 'teacher home');
  think(3, 8);
  page(`/teacher/classes/${me.classId}`, 'teacher class');
  think(5, 10);
  page(`/teacher/classes/${me.classId}/weeks/3/attendance`, 'attendance');
  think(10, 20);
  page(`/teacher/classes/${me.classId}/gradebook`, 'gradebook');
  think(10, 20);
}
