import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { sqlite, db } from './client.js';

migrate(db, { migrationsFolder: './src/db/migrations' });

console.log('✅ Migrations applied');
sqlite.close();
