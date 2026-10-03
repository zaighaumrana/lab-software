import { InstantSafePrismaPg } from './instant-adapter.js';
import { PrismaClient as GeneratedPrismaClient } from './generated/prisma/client.js';

export interface DatabaseClientOptions {
  /** Explicit override for isolated tests/tooling; runtime uses Nest-loaded env. */
  connectionString?: string;
}

/** Owns the PostgreSQL pool; $disconnect disposes the adapter's owned pool. */
export class PrismaClient extends GeneratedPrismaClient {
  constructor(options: DatabaseClientOptions = {}) {
    const connectionString = options.connectionString ?? process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required');
    let url: URL;
    try { url = new URL(connectionString); }
    catch { throw new Error('DATABASE_URL must be a PostgreSQL URL'); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
      throw new Error('DATABASE_URL must use a direct PostgreSQL connection');
    }
    const schema = url.searchParams.get('schema') ?? 'public';
    const adapter = new InstantSafePrismaPg({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 5_000,
    }, { schema });
    super({ adapter });
  }
}

export function createDatabaseClient(options?: DatabaseClientOptions): PrismaClient {
  return new PrismaClient(options);
}
