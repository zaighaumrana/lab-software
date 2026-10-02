import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabaseClient, Decimal, Prisma } from '@lms/database';

const url = process.env.DATABASE_TEST_URL;
if (!url || !/^\/labflow_prisma7_test_[a-f0-9]{16}$/.test(new URL(url).pathname)) {
  throw new Error('Run pnpm test:integration; a disposable database is required');
}
const db = createDatabaseClient({ connectionString: url });
let tenantId: string;
before(async () => {
  await db.$connect();
  tenantId = (await db.tenant.create({ data: { name: 'ORM fixture', slug: 'orm-fixture' } })).id;
});
after(async () => { await db.$disconnect(); });

test('concurrent reads use the conservative pool limit', async () => {
  await Promise.all(Array.from({ length: 15 }, () => db.$queryRaw`SELECT 1::int FROM pg_sleep(0.02)`));
  const rows = await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count
    FROM pg_stat_activity WHERE datname = current_database()`;
  assert(rows[0].count > 1 && rows[0].count <= 10);
});

test('adapter reads and generated model create/update preserve Decimal precision', async () => {
  assert.deepEqual(await db.$queryRaw`SELECT 1::int AS value`, [{ value: 1 }]);
  const row = await db.test.create({ data: { tenantId, code: 'NUMERIC', name: 'Numeric fixture', basePrice: new Decimal('100.10'),
    parameters: { create: { code: 'VALUE', name: 'Value', referenceRanges: { create: { lowNormal: '0.1234', highNormal: '99.9999' } } } } },
    include: { parameters: { include: { referenceRanges: true } } } });
  assert(row.basePrice instanceof Decimal);
  assert.equal(row.basePrice.toFixed(2), '100.10');
  assert.equal(row.parameters[0].referenceRanges[0].lowNormal!.toString(), '0.1234');
  const updated = await db.test.update({ where: { id: row.id }, data: { basePrice: row.basePrice.plus('0.20') } });
  assert.equal(updated.basePrice.toFixed(2), '100.30');
  const numeric = await db.$queryRaw<{ value: Decimal }[]>`SELECT 0.123456::numeric(16,6) AS value`;
  assert.equal(new Decimal(numeric[0].value).toString(), '0.123456');
});

test('interactive transaction commits dependent writes using public TransactionClient', async () => {
  const row = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const t = await tx.test.create({ data: { tenantId, code: 'INTERACTIVE', name: 'Commit', basePrice: '0.10' } });
    return tx.test.update({ where: { id: t.id }, data: { basePrice: new Decimal(t.basePrice).plus('0.20') } });
  });
  assert.equal((await db.test.findUniqueOrThrow({ where: { id: row.id } })).basePrice.toString(), '0.3');
});

test('interactive transaction rolls back on an exception', async () => {
  await assert.rejects(db.$transaction(async tx => {
    await tx.test.create({ data: { tenantId, code: 'ROLLBACK', name: 'Rollback', basePrice: '1.00' } });
    throw new Error('Deliberate rollback');
  }), /Deliberate rollback/);
  assert.equal(await db.test.count({ where: { tenantId, code: 'ROLLBACK' } }), 0);
});

test('batch transaction commits and P2002 failure rolls back all writes', async () => {
  const data = { tenantId, code: 'BATCH', name: 'Batch', basePrice: new Decimal('0.30') };
  const [created, updated] = await db.$transaction([
    db.test.create({ data }),
    db.test.update({ where: { tenantId_code: { tenantId, code: 'BATCH' } }, data: { name: 'Updated' } }),
  ]);
  assert.equal(created.id, updated.id);
  assert.equal(updated.name, 'Updated');
  await assert.rejects(db.$transaction([
    db.test.create({ data: { ...data, code: 'BATCH_ROLLBACK' } }),
    db.test.create({ data }),
  ]), (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002');
  assert.equal(await db.test.count({ where: { code: 'BATCH_ROLLBACK' } }), 0);
});
