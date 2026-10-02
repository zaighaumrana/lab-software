// Deliberately exercises built API + built database exports, never source aliases.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { randomBytes } = require('node:crypto');
const { test } = require('node:test');
const { createDatabaseClient, Decimal } = require('@lms/database');
const apiRequire = createRequire(resolve('../../apps/api/package.json'));
const webRequire = createRequire(resolve('../../apps/web/package.json'));

test('built Nest API, billing transactions, reads, auth, socket and shutdown on isolated fixtures', async () => {
  const url = process.env.DATABASE_TEST_URL;
  assert(url && /^\/labflow_prisma7_test_[a-f0-9]{16}$/.test(new URL(url).pathname));
  const db = createDatabaseClient({ connectionString: url });
  const nativeFetch = global.fetch;
  global.fetch = (input, options) => {
    assert(['127.0.0.1', 'localhost'].includes(new URL(input).hostname), 'External HTTP is forbidden during offline smoke');
    return nativeFetch(input, options);
  };
  let app;
  let socket;
  try {
    const tenant = await db.tenant.create({ data: { name: 'API fixture', slug: 'api-fixture' } });
    const tenantId = tenant.id;
    const branch = await db.branch.create({ data: { tenantId, code: 'TEST', name: 'Test branch' } });
    const branchId = branch.id;
    const password = randomBytes(16).toString('hex');
    await db.user.create({ data: { tenantId, branchId, username: 'orm-test-admin', fullName: 'Test admin',
      role: 'ADMIN', passwordHash: await require('bcrypt').hash(password, 4) } });
    const patient = await db.patient.create({ data: { tenantId, branchId, phone: '03000000000',
      labNumber: 'TEST-LAB', mrcNumber: 'TEST-MRC', fullName: 'Synthetic patient' } });
    const doctor = await db.doctor.create({ data: { tenantId, fullName: 'Synthetic doctor', shareValue: '12.50' } });
    const catalog = await db.test.create({ data: { tenantId, code: 'PRICE', name: 'Price fixture', basePrice: '100.10',
      parameters: { create: { code: 'VALUE', name: 'Value', referenceRanges: { create: {
        lowNormal: '0.1234', highNormal: '1.0000', criticalLow: '0.1000', criticalHigh: '2.0000' } } } } },
      include: { parameters: true } });
    const booking = await db.booking.create({ data: { tenantId, branchId, patientId: patient.id,
      doctorId: doctor.id, bookingCode: 'TEST-BOOKING' } });
    const { NestFactory } = apiRequire('@nestjs/core');
    const { ValidationPipe } = apiRequire('@nestjs/common');
    const { AppModule } = apiRequire('./dist/app.module');
    const { PrismaService } = apiRequire('./dist/common/prisma/prisma.service');
    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    assert.equal(app.get(PrismaService), app.get(PrismaService));
    const base = await app.getUrl();
    let sessionId;
    async function request(path, method = 'GET', body) {
      const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json',
        'x-tenant-id': tenantId, ...(sessionId ? { 'x-session-id': sessionId } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      const result = await res.json();
      assert(res.ok, `${method} ${path}: ${res.status} ${JSON.stringify(result)}`);
      return result;
    }
    sessionId = (await request('/auth/login', 'POST', { username: 'orm-test-admin', password })).sessionId;
    assert(sessionId);
    await request('/auth/me');
    const invoice = await request('/billing/invoices', 'POST', { bookingId: booking.id,
      lines: [{ testId: catalog.id, quantity: 3, manualDiscount: 0.30, manualDiscountReason: 'Fixture' }] });
    assert.equal(new Decimal(invoice.grandTotal).toFixed(2), '300.00');
    const share = await db.doctorShare.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    assert.equal(share.calculatedAmount.toFixed(2), '37.50');
    const payment = await request(`/billing/invoices/${invoice.id}/payments`, 'POST', { amount: 100.10, method: 'CASH' });
    assert.equal(new Decimal(payment.invoice.amountDue).toFixed(2), '199.90');
    const rejected = await fetch(base + `/billing/invoices/${invoice.id}/payments`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
      body: JSON.stringify({ amount: 200, method: 'CASH' }) });
    assert.equal(rejected.status, 400);
    assert.equal(await db.payment.count({ where: { invoiceId: invoice.id } }), 1);
    const sample = await request('/laboratory/samples', 'POST', { invoiceId: invoice.id, sampleType: 'Blood' });
    await request(`/laboratory/samples/${sample.id}/receive`, 'PATCH');
    await request(`/laboratory/samples/${sample.id}/accept`, 'PATCH', {});
    const entered = await request('/laboratory/results', 'POST', { sampleId: sample.id, invoiceLineId: invoice.lines[0].id,
      testId: catalog.id, values: [{ testParameterId: catalog.parameters[0].id, valueNumeric: 0.123399 }],
      releaseImmediately: false });
    assert.equal(new Decimal(entered.values[0].valueNumeric).toFixed(6), '0.123399');
    assert.equal(entered.values[0].flag, 'LOW');
    await request(`/laboratory/invoices/${invoice.id}/ready-for-collection`, 'PATCH');
    const report = await db.report.findUniqueOrThrow({ where: { invoiceId: invoice.id } });
    assert.equal(report.status, 'COMPLETE');
    assert.equal((await db.result.findUniqueOrThrow({ where: { id: entered.id } })).status, 'RELEASED');
    await request(`/reports/${report.id}`);
    for (const path of [`/patients/${patient.id}`, `/bookings/${booking.id}`, `/billing/invoices/${invoice.id}`,
      '/billing/invoices', '/reports', '/settings', '/laboratory/samples/pending']) {
      await request(path);
      console.log(`Fixture-verified GET ${path.replace(patient.id, ':patientId').replace(booking.id, ':bookingId').replace(invoice.id, ':invoiceId')}`);
    }
    const { io } = webRequire('socket.io-client');
    socket = io(base + '/ws/laboratory', { auth: { sessionId }, transports: ['websocket'], reconnection: false });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket startup timed out')), 5000);
      socket.once('connect', () => { clearTimeout(timer); resolve(); });
      socket.once('connect_error', e => { clearTimeout(timer); reject(e); });
    });
    console.log('Fixture-verified Decimal billing/payment/commission, auth session and Socket.IO startup.');
  } finally {
    socket?.disconnect();
    if (app) await app.close();
    await db.$disconnect();
    global.fetch = nativeFetch;
  }
});
