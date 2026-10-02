import { defineConfig, env } from 'prisma/config';
import { loadDatabaseEnvironment } from './src/environment';

// Prisma's config-file mode does not automatically load .env. CLI scripts
// load the package-local file; externally supplied variables take precedence.
loadDatabaseEnvironment();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: env('DATABASE_URL') },
  migrations: {
    path: 'prisma/migrations',
    seed: 'pnpm seed',
  },
});
