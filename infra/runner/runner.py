"""The code runner (ADR-0004, BR-25). POST /run {language, files: [{path, content}], stdin} runs a student's Python or
Java program and replies {status, stdout, stderr, exitCode, ms, truncated, mainClass}. Status is ok, error,
compile_error, timeout, output_limit or needs_input (it wanted more lines than the Input box had); 503 means every
slot stayed busy, 429 that the same person already has a program running, 400 a request it won't run.

It listens on a Unix socket that belongs to the app's group (production: the container has no network at all), or on
RUNNER_LISTEN=host:port with RUNNER_TOKEN (development and CI). Each run gets a slot: its own Linux user and folder,
limits on time, CPU, memory, processes and file size, and a minimal environment. When it ends, the program's processes
are killed and its slot is emptied and checked before anyone else gets it (M17a). Each request names its person with
X-Run-Owner (a SHA-256 of their id, never the id itself), and a person gets one run at a time, so nobody can hold every
slot. Nothing is logged about what a program contains or prints."""
import json
import os
import queue
import re
import resource
import signal
import socket
import socketserver
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SLOTS = int(os.environ.get('RUNNER_SLOTS', '2'))
QUEUE_WAIT = float(os.environ.get('RUNNER_QUEUE_WAIT', '15'))
LISTEN = os.environ.get('RUNNER_LISTEN', '')
SOCKET = os.environ.get('RUNNER_SOCKET', '/sock/runner.sock')
SOCKET_GID = int(os.environ.get('RUNNER_SOCKET_GID', '101'))  # the app's group (Dockerfile)
TOKEN = os.environ.get('RUNNER_TOKEN', '')
WORK = '/work'
FIRST_UID = 2001

RUN_SECONDS = 10
COMPILE_SECONDS = 15
CPU_SECONDS = 5
PYTHON_MEMORY = 256 * 1024 * 1024
OUTPUT_LIMIT = 64 * 1024
FILE_SIZE = 1024 * 1024
MAX_FILES = 30
MAX_SOURCE = 400 * 1024  # the app allows 200 KB of text; this is only a backstop
MAX_STDIN = 16 * 1024
MAX_BODY = 2 * 1024 * 1024

# Python's input() shows the line it read, between markers the editor colours (not a terminal, so no echo otherwise).
# Running out of lines isn't the student's mistake to read as a traceback: the program stops with NEEDS_INPUT, and the
# editor asks for more lines in the Input box. The traceback of a real error leaves out this wrapper's own frame.
NEEDS_INPUT = 75
PYTHON_BOOT = r'''
import builtins, os, sys
_input = builtins.input
def input(prompt=""):
    try:
        line = _input(prompt)
    except EOFError:
        sys.stdout.flush()
        os._exit(75)
    sys.stdout.write("\x1e" + line + "\x1f\n")
    return line
builtins.input = input
entry = sys.argv[1]
sys.argv = [entry]
sys.path.insert(0, "")
with open(entry, encoding="utf-8") as f:
    code = compile(f.read(), entry, "exec")
try:
    exec(code, {"__name__": "__main__", "__file__": entry, "__builtins__": builtins})
except SystemExit:
    raise
except BaseException as e:
    import traceback
    traceback.print_exception(type(e), e, e.__traceback__.tb_next)
    sys.exit(1)
'''

JVM = ['-XX:+UseSerialGC', '-XX:TieredStopAtLevel=1', '-XX:ActiveProcessorCount=1', '-XX:ReservedCodeCacheSize=32m',
       '-XX:MaxMetaspaceSize=96m', '-Xshare:auto']

STAGE = r'''
import json, os, shutil, sys
job = sys.argv[1]
shutil.rmtree(job, ignore_errors=True)
os.makedirs(job, mode=0o700)
for f in json.load(sys.stdin):
    path = os.path.join(job, f["path"])
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as out:
        out.write(f["content"])
'''

# Run as the slot's user after every run: give its folder (and every real folder in it) back to its owner, empty it,
# and remove what it left in the shared /tmp and /dev/shm. Exits 3 when the folder isn't empty afterwards.
RESET = r'''
import os, stat, sys
base, me = sys.argv[1], os.getuid()

def empty(top):
    for root, dirs, files in os.walk(top):
        for d in dirs:
            p = os.path.join(root, d)
            if not os.path.islink(p):
                try:
                    os.chmod(p, stat.S_IRWXU)
                except OSError:
                    pass
    for root, dirs, files in os.walk(top, topdown=False):
        for name in files + dirs:
            p = os.path.join(root, name)
            try:
                os.rmdir(p) if os.path.isdir(p) and not os.path.islink(p) else os.unlink(p)
            except OSError:
                pass

os.chmod(base, stat.S_IRWXU)
empty(base)
for shared in ('/tmp', '/dev/shm'):
    try:
        names = os.listdir(shared)
    except OSError:
        continue
    for name in names:
        p = os.path.join(shared, name)
        try:
            st = os.lstat(p)
        except OSError:
            continue
        if st.st_uid != me:
            continue
        try:
            if stat.S_ISDIR(st.st_mode):
                os.chmod(p, stat.S_IRWXU)
                empty(p)
                os.rmdir(p)
            else:
                os.unlink(p)
        except OSError:
            pass
sys.exit(3 if os.listdir(base) else 0)
'''

SAFE_SEGMENT = re.compile(r'^[A-Za-z0-9_][A-Za-z0-9_.\- ]*$')
OWNER = re.compile(r'^[0-9a-f]{64}$')
slots = queue.Queue()
running = set()  # the owners with a run going or waiting for a slot
running_lock = threading.Lock()


class Refused(Exception):
    pass


def check_request(body):
    language = body.get('language')
    files = body.get('files')
    stdin = body.get('stdin', '')
    if language not in ('python', 'java'):
        raise Refused('Only Python and Java can be run.')
    if not isinstance(files, list) or not 0 < len(files) <= MAX_FILES:
        raise Refused('Send between 1 and 30 files.')
    if not isinstance(stdin, str) or len(stdin) > MAX_STDIN:
        raise Refused('The input is too long.')
    total = 0
    seen = set()
    for f in files:
        path, content = f.get('path') if isinstance(f, dict) else None, f.get('content') if isinstance(f, dict) else None
        if not isinstance(path, str) or not isinstance(content, str):
            raise Refused('Each file needs a path and its text.')
        parts = path.split('/')
        if path.startswith('/') or '\\' in path or not all(SAFE_SEGMENT.match(p) and p not in ('.', '..') for p in parts):
            raise Refused('A file path is not allowed: ' + path[:80])
        if path in seen:
            raise Refused('The same file is sent twice.')
        seen.add(path)
        total += len(content.encode('utf-8'))
    if total > MAX_SOURCE:
        raise Refused('The files are too big to run.')
    return language, files, stdin


def limits(cwd, cpu, processes, memory=None):
    # Runs in the child after it has become the slot's user: root can't enter the slot's folder (mode 700, and no
    # CAP_DAC_OVERRIDE), so the folder is entered here rather than with Popen's cwd.
    def apply():
        os.chdir(cwd)
        resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu + 1))  # SIGXCPU at the limit, SIGKILL a second later
        resource.setrlimit(resource.RLIMIT_NPROC, (processes, processes))
        resource.setrlimit(resource.RLIMIT_FSIZE, (FILE_SIZE, FILE_SIZE))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        resource.setrlimit(resource.RLIMIT_NOFILE, (256, 256))
        if memory:
            resource.setrlimit(resource.RLIMIT_AS, (memory, memory))
        os.umask(0o077)
    return apply


def as_user(uid, cmd, cwd, stdin_text, seconds, cpu, processes, memory=None):
    """Runs cmd as uid in its own session and returns (exit code, stdout, stderr, timed out, output too long)."""
    env = {'PATH': '/opt/java/openjdk/bin:/usr/bin:/bin', 'HOME': cwd, 'LANG': 'C.UTF-8', 'PYTHONIOENCODING': 'utf-8',
           'JAVA_HOME': '/opt/java/openjdk'}
    proc = subprocess.Popen(cmd, env=env, user=uid, group=uid, extra_groups=[], start_new_session=True,
                            preexec_fn=limits(cwd, cpu, processes, memory), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE)
    kept = {'out': bytearray(), 'err': bytearray()}
    too_long = threading.Event()

    def read(stream, name):
        while True:
            chunk = stream.read1(8192)
            if not chunk:
                return
            room = OUTPUT_LIMIT - len(kept[name])
            if room > 0:
                kept[name] += chunk[:room]
            if len(chunk) > room:
                too_long.set()
                kill_group(proc)

    readers = [threading.Thread(target=read, args=(proc.stdout, 'out')), threading.Thread(target=read, args=(proc.stderr, 'err'))]
    for r in readers:
        r.start()
    try:
        proc.stdin.write(stdin_text.encode('utf-8'))
        proc.stdin.close()
    except BrokenPipeError:
        pass
    timed_out = False
    try:
        proc.wait(timeout=seconds)
    except subprocess.TimeoutExpired:
        timed_out = True
        kill_group(proc)
        proc.wait()
    for r in readers:
        r.join(timeout=2)
    if proc.returncode == -signal.SIGXCPU:
        timed_out = True  # out of CPU time
    text = lambda b: b.decode('utf-8', errors='replace')
    return proc.returncode, text(kept['out']), text(kept['err']), timed_out, too_long.is_set()


def kill_group(proc):
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass


def finish(slot):
    """Kills whatever the run left behind (anything its user still runs) and empties its slot. True when it's clean."""
    uid = FIRST_UID + slot
    kill_all = ['python3', '-I', '-c', 'import os, signal\ntry:\n    os.kill(-1, signal.SIGKILL)\nexcept ProcessLookupError:\n    pass']
    try:
        subprocess.run(kill_all, user=uid, group=uid, extra_groups=[], env={}, timeout=10, check=False)
        reset = subprocess.run(['python3', '-I', '-c', RESET, f'{WORK}/{slot}'], user=uid, group=uid, extra_groups=[],
                               env={}, timeout=10, check=False)
    except subprocess.TimeoutExpired:
        return False
    return reset.returncode == 0


def main_class(files):
    """The class to run: the one with a main method, preferring Main.java, with its package."""
    found = [f for f in files if f['path'].endswith('.java') and re.search(r'static\s+void\s+main\s*\(', f['content'])]
    if not found:
        return None
    best = next((f for f in found if f['path'].split('/')[-1] == 'Main.java'), found[0])
    name = best['path'].split('/')[-1][:-5]
    package = re.search(r'^\s*package\s+([\w.]+)\s*;', best['content'], re.M)
    return f'{package.group(1)}.{name}' if package else name


def run(slot, language, files, stdin):
    uid = FIRST_UID + slot
    job = f'{WORK}/{slot}/job'
    started = time.monotonic()
    subprocess.run(['python3', '-I', '-c', STAGE, job], input=json.dumps(files).encode(), user=uid, group=uid,
                   extra_groups=[], env={}, timeout=10, check=True)
    result = {'stdout': '', 'stderr': '', 'exitCode': None, 'truncated': False, 'mainClass': None}
    if language == 'python':
        entry = 'main.py' if any(f['path'] == 'main.py' for f in files) else next(
            (f['path'] for f in sorted(files, key=lambda f: f['path']) if f['path'].endswith('.py')), None)
        if entry is None:
            return {**result, 'status': 'error', 'stderr': 'There is no Python file to run. Add main.py.',
                    'ms': 0}
        code, out, err, timed_out, too_long = as_user(
            uid, ['python3', '-I', '-u', '-c', PYTHON_BOOT, entry], job, stdin, RUN_SECONDS, CPU_SECONDS, 64, PYTHON_MEMORY)
    else:
        main = main_class(files)
        if main is None:
            return {**result, 'status': 'compile_error', 'ms': 0,
                    'stderr': 'No class has a main method. Add public static void main(String[] args) to Main.java.'}
        sources = [f['path'] for f in files if f['path'].endswith('.java')]
        code, out, err, timed_out, too_long = as_user(
            uid, ['javac', *('-J' + o for o in JVM), '-J-Xmx256m', '-encoding', 'UTF-8', '-Xmaxerrs', '20',
                  '-d', '.classes', *sources], job, '', COMPILE_SECONDS, COMPILE_SECONDS, 192)
        if timed_out or code != 0:
            return {**result, 'status': 'timeout' if timed_out else 'compile_error', 'stdout': out, 'stderr': err,
                    'exitCode': code, 'ms': ms(started), 'mainClass': main}
        code, out, err, timed_out, too_long = as_user(
            uid, ['java', *JVM, '-Xmx256m', '-Xss1m', '-cp', '.classes', main], job, stdin, RUN_SECONDS, CPU_SECONDS, 192)
        result['mainClass'] = main
    needs_input = (language == 'python' and code == NEEDS_INPUT) or (
        language == 'java' and code != 0 and 'java.util.NoSuchElementException' in err and 'java.util.Scanner' in err)
    if needs_input:
        err = ''
    status = ('output_limit' if too_long else 'timeout' if timed_out else 'needs_input' if needs_input
              else 'ok' if code == 0 else 'error')
    return {**result, 'status': status, 'stdout': out, 'stderr': err, 'exitCode': code, 'truncated': too_long,
            'ms': ms(started)}


def ms(started):
    return int((time.monotonic() - started) * 1000)


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def address_string(self):
        return 'app'

    def log_message(self, fmt, *args):
        sys.stdout.write('%s %s\n' % (time.strftime('%Y-%m-%dT%H:%M:%S'), fmt % args))
        sys.stdout.flush()

    def reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('content-type', 'application/json')
        self.send_header('content-length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/health':
            return self.reply(200, {'ok': True, 'slots': SLOTS, 'free': slots.qsize()})
        self.reply(404, {'error': 'not found'})

    def do_POST(self):
        if self.path != '/run':
            return self.reply(404, {'error': 'not found'})
        if TOKEN and self.headers.get('authorization') != 'Bearer ' + TOKEN:
            return self.reply(401, {'error': 'wrong token'})
        try:
            size = int(self.headers.get('content-length', '0'))
            if not 0 < size <= MAX_BODY:
                raise Refused('The request is too big.')
            language, files, stdin = check_request(json.loads(self.rfile.read(size)))
        except (Refused, ValueError) as e:
            return self.reply(400, {'error': str(e) if isinstance(e, Refused) else 'Not a valid request.'})
        owner = self.headers.get('x-run-owner', '')
        if not OWNER.match(owner):
            return self.reply(400, {'error': 'Not a valid request.'})
        with running_lock:
            if owner in running:
                return self.reply(429, {'error': 'already running'})
            running.add(owner)
        try:
            self.run_in_slot(language, files, stdin)
        finally:
            with running_lock:
                running.discard(owner)

    def run_in_slot(self, language, files, stdin):
        try:
            slot = slots.get(timeout=QUEUE_WAIT)
        except queue.Empty:
            return self.reply(503, {'error': 'busy'})
        try:
            result = run(slot, language, files, stdin)
        except Exception as e:  # a bug here, not in the student's program
            log('run failed: %s' % type(e).__name__)
            result = None
        clean = finish(slot)
        if clean:
            slots.put(slot)
        try:
            self.reply(200, result) if result else self.reply(500, {'error': 'The runner had a problem.'})
        finally:
            if not clean:
                # Never seen, but never hand a dirty slot on: restart: unless-stopped brings the runner back with a
                # fresh /work, which is quicker than anyone noticing.
                log(f'slot {slot} could not be emptied: stopping so the runner restarts')
                os._exit(70)


def log(line):
    sys.stdout.write(line + '\n')
    sys.stdout.flush()


class UnixServer(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True


def prepare():
    for slot in range(SLOTS):
        path = f'{WORK}/{slot}'
        os.makedirs(path, exist_ok=True)
        os.chmod(path, 0o700)  # before giving it away: without CAP_FOWNER root can't change it after
        os.chown(path, FIRST_UID + slot, FIRST_UID + slot)
        slots.put(slot)


def serve():
    prepare()
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    if LISTEN:
        host, port = LISTEN.rsplit(':', 1)
        server = ThreadingHTTPServer((host, int(port)), Handler)
        where = LISTEN
    else:
        try:
            os.unlink(SOCKET)
        except FileNotFoundError:
            pass
        server = UnixServer(SOCKET, Handler)
        os.chown(SOCKET, 0, SOCKET_GID)
        os.chmod(SOCKET, 0o660)
        where = SOCKET
    sys.stdout.write(f'runner: {SLOTS} slots on {where}\n')
    sys.stdout.flush()
    server.serve_forever()


if __name__ == '__main__':
    serve()
