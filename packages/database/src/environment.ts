import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

/** CLI/seed only. Runtime environment is owned by Nest ConfigModule. */
export function loadDatabaseEnvironment(): void {
  const envPath = resolve(__dirname, '../.env');
  if (existsSync(envPath)) loadEnvFile(envPath);
}
