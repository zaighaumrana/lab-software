import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { loadDatabaseEnvironment } from '../src/environment';

// Never migrate or write to DATABASE_URL. Only a newly-created, guarded test DB.
async function main() {
  loadDatabaseEnvironment();
  const source = new URL(process.env.DATABASE_URL!);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(source.hostname)) {
    throw new Error('Integration harness requires local PostgreSQL');
  }
  const name = `labflow_prisma7_test_${randomBytes(8).toString('hex')}`;
  if (!/^labflow_prisma7_test_[a-f0-9]{16}$/.test(name)) throw new Error('Unsafe test database name');
  const fixture = new URL(source);
  fixture.pathname = `/${name}`;
  const adminUrl = new URL(source);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  let created = false;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    const env = { ...process.env, DATABASE_URL: fixture.toString(), DATABASE_TEST_URL: fixture.toString() };
    const commands = [
      [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
      ...(['b1','b2','c'].includes(process.argv[2]) ? [[resolve({b1:'test/b1-clinical.test.cjs',b2:'test/b2-reports.test.cjs',c:'test/c-financial.test.cjs'}[process.argv[2] as 'b1'|'b2'|'c'])]] : [
        [require.resolve('tsx/cli'), '--test', 'test/integration.test.ts'],
        [resolve('test/api-smoke.cjs')],
      ]),
    ];
    for (const args of commands) {
      const result = spawnSync(process.execPath, args, { env, stdio: 'inherit', timeout: 120_000 });
      if (result.error || result.status !== 0) throw new Error(`Isolated check failed: ${result.error?.message ?? result.status}`);
    }
    const connections = await admin.query('SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = $1', [name]);
    if (connections.rows[0].count !== 0) throw new Error('Test database connections leaked after shutdown');
    console.log('Isolated ORM/API checks passed; zero remaining pool connections.');
  } finally {
    // DROP targets only the database created by this invocation, never the source.
    if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
