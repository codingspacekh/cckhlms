// Runs the Next.js standalone server once per CPU (M7 load test): one Node process renders on one core, and the
// server has two. WEB_WORKERS processes share port 3000; start-up takes a database lock, so only one migrates at a
// time (src/server/startup.ts). If a process dies, another is started in its place and the site keeps answering
// (M17b: one request that ran a process out of memory used to stop the whole container). Only when processes keep
// dying (5 in a minute, e.g. the database is down at start) does everything stop, so Docker restarts the container
// and the health check shows the problem. SIGTERM (docker stop, a deploy) stops them all.
import cluster from 'node:cluster';

const workers = Math.max(1, Number(process.env.WEB_WORKERS ?? 1));
const RESTARTS_PER_MINUTE = 5;

if (cluster.isPrimary) {
  let stopping = false;
  const restarts = [];
  const alive = () => Object.values(cluster.workers ?? {}).filter(Boolean);
  const stopAll = (signal) => {
    stopping = true;
    for (const w of alive()) w.process.kill(signal);
  };
  for (let i = 0; i < workers; i++) cluster.fork();
  cluster.on('exit', (_worker, code, signal) => {
    if (!stopping) {
      const why = signal ?? `exit ${code}`;
      const now = Date.now();
      while (restarts.length && now - restarts[0] > 60_000) restarts.shift();
      if (restarts.length < RESTARTS_PER_MINUTE) {
        restarts.push(now);
        console.error(`A server process stopped (${why}); starting a new one.`);
        cluster.fork();
        return;
      }
      console.error(
        `A server process stopped (${why}), the ${RESTARTS_PER_MINUTE + 1}th in a minute; stopping the others so the container restarts.`,
      );
      process.exitCode = code || 1;
      stopAll('SIGTERM');
    }
    if (alive().length === 0) process.exit();
  });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => stopAll(signal));
} else {
  await import('./server.js');
}
