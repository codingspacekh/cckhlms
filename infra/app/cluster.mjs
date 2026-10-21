// Runs the Next.js standalone server once per CPU (M7 load test): one Node process renders on one core, and the
// server has two. WEB_WORKERS processes share port 3000; start-up takes a database lock, so only one migrates at a
// time (src/server/startup.ts). If any process stops, the others stop too and the container exits, so Docker
// restarts it whole and the health check shows the problem.
import cluster from 'node:cluster';

const workers = Math.max(1, Number(process.env.WEB_WORKERS ?? 1));

if (cluster.isPrimary) {
  let stopping = false;
  const alive = () => Object.values(cluster.workers ?? {}).filter(Boolean);
  const stopAll = (signal) => {
    stopping = true;
    for (const w of alive()) w.process.kill(signal);
  };
  for (let i = 0; i < workers; i++) cluster.fork();
  cluster.on('exit', (_worker, code, signal) => {
    if (!stopping) {
      console.error(`A server process stopped (${signal ?? `exit ${code}`}); stopping the others so the container restarts.`);
      process.exitCode = code || 1;
      stopAll('SIGTERM');
    }
    if (alive().length === 0) process.exit();
  });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => stopAll(signal));
} else {
  await import('./server.js');
}
