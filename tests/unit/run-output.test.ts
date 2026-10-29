// M11 · FR-CODE-10: what the Run panel makes of the runner's output.
import { describe, expect, it } from 'vitest';
import { errorPlace, outputParts } from '@/lib/run-output';

describe('outputParts', () => {
  it('marks the lines Python read from the Input box, so they can be shown in green', () => {
    expect(outputParts('Name? \x1eDara\x1f\n\x1e11\x1f\nHi Dara 12\n')).toEqual([
      { text: 'Name? ', input: false },
      { text: 'Dara', input: true },
      { text: '\n', input: false },
      { text: '11', input: true },
      { text: '\nHi Dara 12\n', input: false },
    ]);
  });

  it('leaves output without markers as it is, and a stray marker as text', () => {
    expect(outputParts('hi\n')).toEqual([{ text: 'hi\n', input: false }]);
    expect(outputParts('a\x1eb')).toEqual([{ text: 'a\x1eb', input: false }]);
  });
});

describe('errorPlace', () => {
  const files = ['main.py', 'helpers.py', 'src/com/club/Main.java', 'src/com/club/Table.java'];

  it("finds the student's own file and line in a Python traceback, not Python's", () => {
    const tb =
      'Traceback (most recent call last):\n  File "main.py", line 2, in <module>\n    print(double(x))\n  File "helpers.py", line 3, in double\n    return n / 0\nZeroDivisionError: division by zero\n';
    expect(errorPlace(tb, files)).toEqual({ path: 'helpers.py', line: 3 });
    expect(errorPlace('  File "/usr/lib/python3.12/json/__init__.py", line 346\n', files)).toBeNull();
  });

  it("finds javac's first error, and the student's line in a Java stack trace", () => {
    expect(errorPlace("src/com/club/Main.java:7: error: ';' expected\n        Table.print(n, 3)\n", files)).toEqual({
      path: 'src/com/club/Main.java',
      line: 7,
    });
    const trace =
      'Exception in thread "main" java.lang.ArithmeticException: / by zero\n\tat com.club.Table.print(Table.java:4)\n\tat com.club.Main.main(Main.java:7)\n';
    expect(errorPlace(trace, files)).toEqual({ path: 'src/com/club/Table.java', line: 4 });
  });

  it('gives nothing when the output names no file of the project', () => {
    expect(errorPlace('Killed\n', files)).toBeNull();
    expect(errorPlace('Other.java:3: error: x\n', files)).toBeNull();
  });
});
