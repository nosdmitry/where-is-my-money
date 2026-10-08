import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './client.js';

/**
 * Применяет миграции из указанной папки.
 * Вызывается при старте приложения и из CLI.
 */
export function runMigrations(migrationsFolder: string): void {
  migrate(db, { migrationsFolder });
}
