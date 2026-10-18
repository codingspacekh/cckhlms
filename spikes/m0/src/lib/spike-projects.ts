// Example projects shared by the spike pages and the tests.
export type ProjectFile = { path: string; content: string };
export type Lang = 'python' | 'java' | 'web';
export type SpikeProject = { id: string; lang: Lang; title: string; files: ProjectFile[] };

const python: SpikeProject = {
  id: 'python', lang: 'python', title: 'Number guessing game',
  files: [{ path: 'main.py', content: 'import random\n\nsecret = random.randint(1, 20)\nguess = int(input("Your guess: "))\nprint("You got it!" if guess == secret else "Try again")\n' }],
};

const java: SpikeProject = {
  id: 'java', lang: 'java', title: 'Shapes with packages',
  files: [
    { path: 'src/com/club/shapes/Main.java', content: 'package com.club.shapes;\n\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println(new Square(3).area());\n    }\n}\n' },
    { path: 'src/com/club/shapes/Square.java', content: 'package com.club.shape;\n\npublic class Square {\n    private final double side;\n    public Square(double side) { this.side = side; }\n    public double area() { return side * side; }\n}\n' },
  ],
};

// 30 files across 6 packages: the size of a large student project (FR-CODE-02 limit).
const pkgs = ['game', 'game.model', 'game.view', 'game.input', 'game.sound', 'game.util'];
const java30: SpikeProject = {
  id: 'java30', lang: 'java', title: 'Big Java project',
  files: pkgs.flatMap((p) => Array.from({ length: 5 }, (_, i) => {
    const cls = `${p.split('.').pop()![0].toUpperCase()}${p.split('.').pop()!.slice(1)}Part${i + 1}`;
    const body = Array.from({ length: 30 }, (_, j) => `    public int step${j}(int x) { return x * ${j + 1} + ${i}; }`).join('\n');
    return { path: `src/com/club/${p.replaceAll('.', '/')}/${cls}.java`, content: `package com.club.${p};\n\npublic class ${cls} {\n${body}\n}\n` };
  })),
};

const web: SpikeProject = {
  id: 'web', lang: 'web', title: 'My profile page',
  files: [
    { path: 'index.html', content: `<!doctype html>
<html>
<head>
  <title>Bopha's page</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>Hi, I'm Bopha</h1>
  <p id="out">waiting</p>
  <button id="btn" onclick="count++; document.getElementById('clicks').textContent = 'clicked ' + count">Say hello</button>
  <p id="clicks">not clicked</p>
  <script>var count = 0; document.getElementById('out').textContent = 'inline script ran';</script>
  <script src="script.js"></script>
</body>
</html>
` },
    { path: 'style.css', content: 'body { font-family: sans-serif; padding: 24px; }\nh1 { color: #1c5cab; }\n' },
    { path: 'script.js', content: 'console.log("page loaded");\n' },
  ],
};

// A hostile "student" page: tries to read the LMS and act as the signed-in user.
const probe: SpikeProject = {
  id: 'probe', lang: 'web', title: 'Isolation probe',
  files: [{ path: 'index.html', content: `<!doctype html>
<html><head></head><body><p>probe</p>
<script>
  function attempt(label, fn) { try { var v = fn(); console.log(label + ': READ ' + String(v).slice(0, 40)); } catch (e) { console.log(label + ': blocked'); } }
  attempt('cookie', function () { return document.cookie || (function () { throw new Error('empty'); })(); });
  attempt('parent', function () { return parent.document.title; });
  attempt('top', function () { return top.location.href; });
  attempt('storage', function () { return localStorage.length; });
  fetch('http://lms.localhost:3101/api/spike/echo', { method: 'POST', credentials: 'include', body: 'steal' })
    .then(function (r) { console.log('fetch: status ' + r.status); })
    .catch(function () { console.log('fetch: no readable response'); });
</script></body></html>
` }],
};

export const PROJECTS: Record<string, SpikeProject> = { python, java, java30, web, probe };
