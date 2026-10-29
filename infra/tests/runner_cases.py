"""Cases for the code runner (ADR-0004, BR-25), run by runner-image.sh inside a client container that has the runner's
socket mounted, as the app has it in production. Each case sends one run and checks the reply."""
import http.client
import json
import os
import socket
import sys
import threading
import time

SOCK = os.environ.get('RUNNER_SOCK', '/sock/runner.sock')
TCP = os.environ.get('RUNNER_TCP')  # host:port, for the token checks
TOKEN = os.environ.get('RUNNER_TOKEN', '')
failures = []


class UnixConnection(http.client.HTTPConnection):
    def __init__(self, path, timeout=60):
        super().__init__('localhost', timeout=timeout)
        self.path = path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self.path)


def request(method, url, body=None, token=None):
    if TCP:
        host, port = TCP.split(':')
        conn = http.client.HTTPConnection(host, int(port), timeout=60)
    else:
        conn = UnixConnection(SOCK)
    headers = {'content-type': 'application/json'}
    if token:
        headers['authorization'] = 'Bearer ' + token
    conn.request(method, url, body=json.dumps(body) if body is not None else None, headers=headers)
    res = conn.getresponse()
    data = res.read().decode()
    conn.close()
    try:
        return res.status, json.loads(data)
    except ValueError:
        return res.status, data


def run(language, files, stdin='', token=None):
    if isinstance(files, str):
        files = {('main.py' if language == 'python' else 'Main.java'): files}
    return request('POST', '/run', {'language': language, 'files': [{'path': p, 'content': c} for p, c in files.items()], 'stdin': stdin}, token)


def check(name, ok, detail=''):
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else ': ' + str(detail)[:600]))
    if not ok:
        failures.append(name)


def tokens():
    status, _ = run('python', 'print(1)')
    check('TCP: a run without the token is refused', status == 401, status)
    status, body = run('python', 'print(1)', token=TOKEN)
    check('TCP: a run with the token works', status == 200 and body['stdout'] == '1\n', body)
    sys.exit(1 if failures else 0)


def main():
    if TCP:
        tokens()
    status, body = request('GET', '/health')
    check('health', status == 200 and body.get('ok') is True, body)

    status, r = run('python', 'print("Hi from Python")')
    check('Python prints', status == 200 and r['status'] == 'ok' and r['stdout'] == 'Hi from Python\n' and r['exitCode'] == 0, r)

    status, r = run('python', 'name = input("Name? ")\nage = int(input())\nprint("Hi", name, age + 1)', 'Dara\n11\n')
    check('Python reads the input box, and shows each line it read between markers',
          r.get('stdout') == 'Name? \x1eDara\x1f\n\x1e11\x1f\nHi Dara 12\n', r)

    status, r = run('python', 'name = input("Name? ")\nprint("Hi", name)')
    check('Python asking for more input than the box has is "needs input", with the prompt and no traceback',
          r['status'] == 'needs_input' and r['stdout'] == 'Name? ' and r['stderr'] == '', r)

    status, r = run('java', 'import java.util.Scanner;\npublic class Main { public static void main(String[] a) {\n'
                    '  Scanner in = new Scanner(System.in); System.out.print("Age? "); int n = in.nextInt(); } }')
    check('Java reading more than the box has is "needs input" too', r['status'] == 'needs_input' and r['stdout'] == 'Age? ', r)

    status, r = run('python', 'x = 1\nprint(x / 0)')
    check('a Python exception shows its traceback with the file and line',
          r['status'] == 'error' and 'ZeroDivisionError' in r['stderr'] and 'File "main.py", line 2' in r['stderr'], r)

    status, r = run('python', {'main.py': 'from helpers import double\nprint(double(21))', 'helpers.py': 'def double(n):\n    return n * 2'})
    check('Python imports another file of the project', r['stdout'] == '42\n', r)

    java = {
        'src/com/club/Main.java': 'package com.club;\nimport java.util.Scanner;\npublic class Main {\n  public static void main(String[] a) {\n'
        '    Scanner in = new Scanner(System.in);\n    int n = in.nextInt();\n    Table.print(n, 3);\n  }\n}\n',
        'src/com/club/Table.java': 'package com.club;\nclass Table {\n  static void print(int n, int upTo) {\n'
        '    for (int i = 1; i <= upTo; i++) System.out.println(n + " x " + i + " = " + n * i);\n  }\n}\n',
    }
    status, r = run('java', java, '7\n')
    check('Java with two classes in a package compiles, finds com.club.Main and reads the input',
          r.get('status') == 'ok' and r['stdout'] == '7 x 1 = 7\n7 x 2 = 14\n7 x 3 = 21\n' and r.get('mainClass') == 'com.club.Main', r)

    broken = dict(java)
    broken['src/com/club/Main.java'] = broken['src/com/club/Main.java'].replace('Table.print(n, 3);', 'Table.print(n, 3)')
    status, r = run('java', broken, '7\n')
    check("a Java compile error comes back as one, with javac's file and line",
          r['status'] == 'compile_error' and 'src/com/club/Main.java:7: error' in r['stderr'], r)

    status, r = run('java', 'public class Main { public static void main(String[] a) { int[] x = new int[1]; x[2] = 1; } }')
    check('a Java exception is an error with its stack trace', r['status'] == 'error' and 'ArrayIndexOutOfBoundsException' in r['stderr'], r)

    status, r = run('java', 'class Helper {}')
    check('Java without a main method says so', r['status'] == 'compile_error' and 'main' in r['stderr'], r)

    t = time.time()
    status, r = run('python', 'while True:\n    pass')
    check('an endless loop stops at the time limit', r['status'] == 'timeout' and time.time() - t < 14, (r, time.time() - t))

    status, r = run('python', 'x = "a" * (10 ** 9)')
    check('a memory hog gets a MemoryError', r['status'] == 'error' and 'MemoryError' in r['stderr'], r)

    status, r = run('python', 'while True:\n    print("x" * 1000)')
    check('a flood of output is stopped and cut at 64 KB', r['status'] == 'output_limit' and len(r['stdout']) <= 65536 and r['truncated'], {k: v for k, v in r.items() if k != 'stdout'})

    status, r = run('python', 'import os\nwhile True:\n    try:\n        os.fork()\n    except OSError:\n        pass')
    check('a fork bomb is stopped', status == 200 and r['status'] in ('timeout', 'error'), r)
    status, r = run('python', 'print("still here")')
    check('... and the runner still works after it', r.get('stdout') == 'still here\n', r)

    probe = '''import os, socket
def tryit(name, fn):
    try:
        fn()
        print(name, "OPEN")
    except Exception as e:
        print(name, "blocked", type(e).__name__)
tryit("internet", lambda: socket.create_connection(("1.1.1.1", 80), timeout=2))
tryit("dns", lambda: socket.getaddrinfo("db", 5432))
tryit("runner socket", lambda: socket.socket(socket.AF_UNIX).connect("/sock/runner.sock"))
tryit("pid 1 environment", lambda: open("/proc/1/environ").read())
tryit("write outside", lambda: open("/etc/x", "w"))
here = os.path.dirname(os.getcwd())
for d in sorted(os.listdir("/work")):
    p = os.path.join("/work", d)
    if p != here:
        tryit("another run's folder", lambda: os.listdir(p))
'''
    status, r = run('python', probe)
    out = r.get('stdout', '')
    check('no network, no runner socket, no other run, nothing outside its folder',
          'OPEN' not in out and out.count('blocked') >= 6, r)

    status, r = run('python', {'../escape.py': 'print(1)'})
    check('a file path with .. is refused', status == 400, (status, r))
    status, r = run('python', {'/etc/passwd': 'x'})
    check('an absolute file path is refused', status == 400, (status, r))
    status, r = run('ruby', 'puts 1')
    check('an unknown language is refused', status == 400, (status, r))

    # Two run at once; a third waits for a free slot. With RUNNER_QUEUE_WAIT=2 (set by runner-image.sh) a third that
    # waits longer than that is told the runner is busy.
    results = []

    def slow():
        results.append(run('python', 'import time\ntime.sleep(4)\nprint("done")'))

    threads = [threading.Thread(target=slow) for _ in range(3)]
    for th in threads:
        th.start()
        time.sleep(0.2)
    for th in threads:
        th.join()
    oks = [r for s, r in results if s == 200 and r.get('stdout') == 'done\n']
    busy = [r for s, r in results if s == 503]
    check('two runs at once; a third waiting too long is told the runner is busy', len(oks) == 2 and len(busy) == 1, results)

    sys.exit(1 if failures else 0)


main()
