// Waits until the spike Postgres accepts connections (docker compose is not installed on this machine).
import pg from 'pg';
const url = 'postgres://lms:lms-spike-only@localhost:54329/lms_spike';
for (let i = 0; i < 60; i++) {
  const c = new pg.Client(url);
  try { await c.connect(); await c.end(); console.log('db ready'); process.exit(0); } catch { await new Promise((r) => setTimeout(r, 1000)); }
}
console.error('db not ready after 60 s'); process.exit(1);
