import { randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { loadDatabaseEnvironment } from '../src/environment';
import { populateLegacyFixture } from './phase-a-legacy-fixture';

const legacyMigrations = ['20260807232849_init','20260810021010_added_out_source_test',
  '20260822000000_add_report_print_tracking','20260822010000_add_cash_shifts','20260926000000_sms_templates_sendpk_v2'];
const quote = (name: string) => '"' + name.replaceAll('"','""') + '"';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

async function fingerprint(c: Client, original?: Record<string, { columns: string[]; count: number; hash: string }>) {
  const columns = (await c.query(`SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name<>'_prisma_migrations' ORDER BY table_name,ordinal_position`)).rows;
  const result: Record<string, { columns: string[]; count: number; hash: string }> = {};
  const tables = original ? Object.keys(original) : [...new Set<string>(columns.map(r => r.table_name))];
  for (const table of tables) {
    const names = original?.[table].columns ?? columns.filter(r=>r.table_name===table).map(r=>r.column_name);
    const rows = (await c.query(`SELECT row_to_json(t)::text AS row FROM
      (SELECT ${names.map(quote).join(',')} FROM ${quote(table)}) t ORDER BY row_to_json(t)::text COLLATE "C"`)).rows;
    result[table] = { columns: names, count: rows.length, hash: hash(rows.map(r=>r.row).join('\n')) };
  }
  return result;
}

async function main() {
  loadDatabaseEnvironment();
  const source = new URL(process.env.DATABASE_URL!);
  if (!['localhost','127.0.0.1','[::1]'].includes(source.hostname)) throw Error('Local disposable databases required');
  const adminUrl = new URL(source); adminUrl.pathname='/postgres';
  const admin = new Client({connectionString:adminUrl.toString()}); await admin.connect();
  const temp = mkdtempSync(join(tmpdir(),'labflow-phase-a-'));
  for (const name of legacyMigrations) cpSync(resolve('prisma/migrations',name),join(temp,'migrations',name),{recursive:true});
  cpSync(resolve('prisma/migrations/migration_lock.toml'),join(temp,'migrations/migration_lock.toml'));
  // Deploy reads only the five copied legacy SQL migrations. A datasource-only
  // config avoids depending on HEAD still being a pre-Phase-A commit after this lands.
  writeFileSync(join(temp,'schema.prisma'),'datasource db {\n  provider = "postgresql"\n}\n');
  const legacyConfig = join(temp,'prisma7.config.ts');
  writeFileSync(legacyConfig,`export default ${JSON.stringify({schema:join(temp,'schema.prisma'),datasource:{url:'ENV_URL'},migrations:{path:join(temp,'migrations')}}).replace('"ENV_URL"','process.env.DATABASE_URL')};`);
  const evidence: Record<string,unknown> = {};
  try {
    for (const scenario of ['fresh','populated']) {
      const name = `labflow_phase_a_${scenario}_${randomBytes(8).toString('hex')}`;
      if (!/^labflow_phase_a_(fresh|populated)_[a-f0-9]{16}$/.test(name)) throw Error('Unsafe fixture name');
      const url = new URL(source); url.pathname='/'+name;
      let created=false;
      let c: Client|undefined;
      try {
        await admin.query(`CREATE DATABASE ${quote(name)}`); created=true;
        const env = {...process.env,DATABASE_URL:url.toString(),DATABASE_TEST_URL:url.toString(),RUNTIME_DATABASE_URL:'',DB_RUNTIME_MODE:'development',NODE_ENV:'test',SENDPK_API_KEY:'',SENDPK_SENDER:''};
        function cli(args: string[]) {
          const result = spawnSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),...args],{env,stdio:'inherit',timeout:120_000});
          if (result.error || result.status!==0) throw Error(`Disposable CLI failed: ${result.error?.message ?? result.status}`);
        }
        let before: Awaited<ReturnType<typeof fingerprint>>|undefined;
        let oldMigrationRows: unknown[]=[];
        if (scenario==='populated') {
          cli(['migrate','deploy','--config',legacyConfig]);
          c = new Client({connectionString:url.toString()}); await c.connect();
          assert.equal((await c.query('SELECT count(*)::int AS count FROM _prisma_migrations')).rows[0].count,5);
          assert.equal((await c.query("SELECT to_regclass('public.visits') AS visits")).rows[0].visits,null);
          assert.equal((await c.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows[0].count,30);
          await populateLegacyFixture(c);
          before = await fingerprint(c);
          oldMigrationRows=(await c.query('SELECT * FROM _prisma_migrations ORDER BY migration_name')).rows;
        }
        const started=performance.now(); cli(['migrate','deploy']); const migrationMs=performance.now()-started;
        c ??= new Client({connectionString:url.toString()}); if (scenario==='fresh') await c.connect();
        assert.equal((await c.query('SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')).rows[0].count,9);
        if (before) {
          assert.deepEqual(await fingerprint(c,before),before,'Every old column/value/ID/count must be identical');
          assert.deepEqual((await c.query('SELECT * FROM _prisma_migrations WHERE migration_name=ANY($1) ORDER BY migration_name',[legacyMigrations])).rows,oldMigrationRows);
          // The data portion is retry-safe without reexecuting CREATE FUNCTION/transaction framing.
          const backfill = readFileSync(resolve('prisma/migrations/20261002020000_phase_a_capture_and_backfill/migration.sql'),'utf8').split('-- Deterministic natural keys')[1].replace(/COMMIT;\s*$/,'');
          const allBefore=await fingerprint(c);
          await c.query('BEGIN'); await c.query('-- Deterministic natural keys'+backfill); await c.query('COMMIT');
          assert.deepEqual(await fingerprint(c),allBefore,'Backfill retry must preserve new IDs and hashes too');
          const testRun=spawnSync(process.execPath,[require.resolve('tsx/cli'),'--test','test/phase-a.test.ts'],{env,stdio:'inherit',timeout:120_000});
          if (testRun.error || testRun.status!==0) throw Error('Phase A behavior tests failed');
        } else {
          const tables=await fingerprint(c); assert.equal(Object.keys(tables).length,36);
          assert(Object.values(tables).every(t=>t.count===0),'Fresh migration cannot seed data');
        }
        // CHECKs/triggers are not represented by Prisma's diff. Supported DDL must still match.
        cli(['migrate','diff','--from-config-datasource','--to-schema','prisma/schema.prisma','--exit-code']);
        evidence[scenario]={migrationMs,legacyFingerprints:before,finishedMigrations:9,passed:true};
        console.log(`${scenario} migration, preservation and structural diff passed (${migrationMs.toFixed(1)} ms).`);
      } finally {
        await c?.end();
        if (created) {
          const connections=(await admin.query('SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1',[name])).rows[0].count;
          await admin.query(`DROP DATABASE ${quote(name)} WITH (FORCE)`);
          assert.equal(connections,0,'No test client/pool leak');
        }
      }
    }
  } finally { await admin.end(); writeFileSync(join(temp,'evidence.json'),JSON.stringify(evidence,null,2)); console.log('Phase A evidence:',join(temp,'evidence.json')); }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
