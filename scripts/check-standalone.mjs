// Pre-launch review finding 2: the standalone build (what the image ships) must hold only the server and its traced
// dependencies. A file path Next can't work out at build time makes it copy the whole project folder, which on a
// laptop includes .env, out/ (drill keys), uploads/ and resource/. Run after `npm run build`.
import { readdirSync } from 'node:fs';

const dir = process.argv[2] ?? '.next/standalone';
// drizzle/ holds the migrations the app runs at start. Next copies .env files itself (not by tracing); the image
// never has them because .dockerignore leaves them out of the build.
const allowed = new Set(['.next', 'node_modules', 'package.json', 'server.js', 'drizzle']);
const extra = readdirSync(dir).filter((name) => !allowed.has(name) && !name.startsWith('.env'));
if (extra.length) {
  console.error(`${dir} holds files that don't belong in the image: ${extra.join(', ')}`);
  process.exit(1);
}
console.log(`${dir}: only ${[...allowed].join(', ')}`);
