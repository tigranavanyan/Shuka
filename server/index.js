import { getDb, migrate } from './db.js';
import { createApp } from './app.js';
import { PORT, DB_PATH } from './config.js';
import { scheduleDailyBackup } from '../scripts/backup.js';

const db = getDb();
migrate(db);
const app = createApp(db);
const server = app.listen(PORT, () => {
  console.log(`Shuka listening on http://localhost:${PORT}  (db: ${DB_PATH})`);
});
if (process.env.BACKUP_DAILY !== '0') scheduleDailyBackup(db);

const shutdown = () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
