import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDatabaseClient, Decimal, Prisma } from '@lms/database';

test('Prisma 7 CLI automatically discovers the versioned config without a database', () => {
  const packageDir = resolve(__dirname, '..');
  assert.equal(existsSync(resolve(packageDir, 'prisma.config.ts')), false);
  const result = spawnSync(process.execPath,
    [resolve(packageDir, 'node_modules/prisma/build/index.js'), 'validate'], {
      cwd: packageDir,
      env: { ...process.env, DATABASE_URL: 'postgresql://localhost/prisma7_config_validation' },
      encoding: 'utf8',
      timeout: 30_000,
    });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stdout + result.stderr, /Loaded Prisma config from prisma7\.config\.ts/);
});

test('construction requires an explicit direct PostgreSQL URL', async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    assert.throws(() => createDatabaseClient(), /DATABASE_URL is required/);
    assert.throws(() => createDatabaseClient({ connectionString: 'invalid' }), /PostgreSQL URL/);
    assert.throws(() => createDatabaseClient({ connectionString: 'prisma://localhost/db' }), /direct PostgreSQL/);
    const client = createDatabaseClient({ connectionString: 'postgresql://localhost/fixture?schema=public' });
    await client.$disconnect(); // construction opens no pool connections
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

test('public Decimal preserves money, discounts, payments, commissions and JSON', () => {
  assert.equal(Decimal, Prisma.Decimal);
  assert.equal(new Decimal('0.1').plus('0.2').toString(), '0.3');
  const subtotal = new Decimal('100.10').mul(3);
  const total = subtotal.minus('0.30');
  const paid = new Decimal('100.01').plus('0.09');
  assert.equal(total.toFixed(2), '300.00');
  assert.equal(total.minus(paid).toFixed(2), '199.90');
  assert.equal(total.mul('12.50').div(100).toFixed(2), '37.50');
  assert.equal(new Decimal('12.50').mul(3).toFixed(2), '37.50');
  assert.equal(JSON.stringify({ total, reference: new Decimal('0.1234') }), '{"total":"300","reference":"0.1234"}');
  assert(new Decimal('0.123399').lessThan('0.1234'));
});

test('package exports block generated-client implementation paths', () => {
  assert.throws(() => require.resolve('@lms/database/src/generated/prisma/client'),
    { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
});
