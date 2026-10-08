import path from 'node:path';
import { sqlite } from './client.js';
import { runMigrations } from './migrate.js';

const folder = path.join(process.cwd(), 'src/db/migrations');
runMigrations(folder);

console.log('✅ Migrations applied');
sqlite.close();
