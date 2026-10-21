// M7 (ZAP baseline): a form submitted before the page's script has loaded is sent by the browser itself. Without
// method="post" that is a GET, and the fields (a password on the sign-in page) land in the address bar, the
// history and the logs. So every form either has a Server Action or says method="post".
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith('.tsx') ? [path] : [];
  });
}

// Each <form …> opening tag, read up to its closing '>' (skipping any '>' inside {…}, like an arrow function).
function formTags(source: string): string[] {
  const tags: string[] = [];
  for (const m of source.matchAll(/<form\b/g)) {
    let depth = 0;
    let i = m.index!;
    for (; i < source.length; i++) {
      const c = source[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    tags.push(source.slice(m.index!, i + 1));
  }
  return tags;
}

describe('forms', () => {
  it('reads opening tags with arrow functions in them', () => {
    expect(formTags('<form onSubmit={(e) => go(e)} method="post">x</form>')).toEqual(['<form onSubmit={(e) => go(e)} method="post">']);
  });

  it('never send their fields in the address', () => {
    const root = process.cwd();
    const bad = sourceFiles(join(root, 'src')).flatMap((f) =>
      formTags(
        readFileSync(f, 'utf8')
          .split('\n')
          .filter((line) => !line.trim().startsWith('//'))
          .join('\n'),
      )
        .filter((tag) => !/\saction=\{/.test(tag) && !/\smethod="post"/.test(tag))
        .map((tag) => `${relative(root, f)}: ${tag.replace(/\s+/g, ' ').slice(0, 80)}`),
    );
    expect(bad).toEqual([]);
  });
});
