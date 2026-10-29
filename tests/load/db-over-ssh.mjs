// For G1's live load test (tests/load/live.sh): forwards 127.0.0.1:<port> on the laptop to PostgreSQL inside the
// server's db container. Each connection runs `nc` in that container over SSH as deploy, so no port opens on the
// server and no database password leaves it (inside the container, connections from 127.0.0.1 are trusted).
//   node tests/load/db-over-ssh.mjs <server> [port]
import { spawn } from 'node:child_process';
import net from 'node:net';

const [server, port = '54331'] = process.argv.slice(2);
if (!server) throw new Error('usage: node tests/load/db-over-ssh.mjs <server> [port]');
// One shared SSH connection for all of them, so the seed's pool doesn't open ten. (macOS's own temp folder makes the
// socket path too long.)
const shared = ['-o', 'ControlMaster=auto', '-o', 'ControlPath=/tmp/cckhlms-db-%C', '-o', 'ControlPersist=60'];

net
  .createServer((socket) => {
    const ssh = spawn('ssh', ['-o', 'BatchMode=yes', ...shared, `deploy@${server}`, 'docker exec -i cckhlms-db-1 nc 127.0.0.1 5432'], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    socket.pipe(ssh.stdin);
    ssh.stdout.pipe(socket);
    const close = () => {
      socket.destroy();
      ssh.kill();
    };
    socket.on('close', close).on('error', close);
    ssh.on('exit', close);
  })
  .listen(Number(port), '127.0.0.1', () => console.log(`database of ${server} on 127.0.0.1:${port}`));
