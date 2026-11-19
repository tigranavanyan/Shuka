// `npm run dev`: API server with --watch on :3000 and Vite with hot reload on :5173.
import { spawn, spawnSync } from 'node:child_process';

spawnSync(process.execPath, ['scripts/migrate.js'], { stdio: 'inherit' });
spawnSync(process.execPath, ['scripts/seed.js', '--if-empty'], { stdio: 'inherit' });
const procs = [
  spawn(process.execPath, ['--watch-path=server', 'server/index.js'], { stdio: 'inherit', env: { ...process.env, BACKUP_DAILY: '0' } }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }),
];
const stop = () => { procs.forEach((p) => p.kill('SIGTERM')); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
console.log('\n  Open http://localhost:5173\n');
