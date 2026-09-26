/**
 * Seed script — default tenant, users, multi-parameter tests, packages, doctor.
 * Run: pnpm db:seed
 */

import { PrismaClient, Role, ShareType, ParameterValueType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'default' },
    update: {},
    create: {
      id: 'default-tenant',
      name: 'Default Laboratory',
      slug: 'default',
      isActive: true,
    },
  });
  console.log('  Tenant:', tenant.name);

  const branch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'MAIN' } },
    update: {},
    create: {
      id: 'default-branch',
      tenantId: tenant.id,
      name: 'Main Branch',
      code: 'MAIN',
      address: 'Lab Address',
      phone: '03001234567',
      isActive: true,
    },
  });
  console.log('  Branch:', branch.name);

  const passwordHash = await bcrypt.hash('admin123', 10);

  await prisma.user.upsert({
    where: { tenantId_username: { tenantId: tenant.id, username: 'admin' } },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      username: 'admin',
      passwordHash,
      fullName: 'Lab Owner (Admin)',
      role: Role.ADMIN,
      isActive: true,
    },
  });
  console.log('  Admin: admin / admin123');

  await prisma.user.upsert({
    where: { tenantId_username: { tenantId: tenant.id, username: 'operator' } },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      username: 'operator',
      passwordHash,
      fullName: 'Lab Operator',
      role: Role.LAB_OPERATOR,
      isActive: true,
    },
  });
  console.log('  Operator: operator / admin123');

  // ----- Single-value tests -----
  async function upsertSimpleTest(
    code: string,
    name: string,
    category: string,
    sampleType: string,
    price: number,
    hours: number,
    unit: string,
    low: number,
    high: number,
    critLow: number,
    critHigh: number,
  ) {
    const test = await prisma.test.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code } },
      update: {},
      create: {
        tenantId: tenant.id,
        code,
        name,
        category,
        sampleType,
        basePrice: price,
        turnaroundHours: hours,
        isActive: true,
        isPanel: false,
        parameters: {
          create: [
            {
              code,
              name,
              valueType: ParameterValueType.NUMERIC,
              unit,
              sortOrder: 0,
              isRequired: true,
              referenceRanges: {
                create: [
                  {
                    gender: null,
                    ageMinMonths: 216,
                    ageMaxMonths: null,
                    lowNormal: low,
                    highNormal: high,
                    criticalLow: critLow,
                    criticalHigh: critHigh,
                    unit,
                  },
                ],
              },
            },
          ],
        },
      },
    });
    return test;
  }

  const fbs = await upsertSimpleTest('FBS', 'Fasting Blood Sugar', 'Chemistry', 'Blood', 350, 2, 'mg/dL', 70, 100, 40, 400);
  const tsh = await upsertSimpleTest('TSH', 'Thyroid Stimulating Hormone', 'Hormones', 'Blood', 1800, 24, 'mIU/L', 0.4, 4.0, 0.01, 50);
  const hba1c = await upsertSimpleTest('HBA1C', 'HbA1c', 'Chemistry', 'Blood', 1600, 8, '%', 4.0, 5.6, 3.0, 15);
  await upsertSimpleTest('LFT', 'Liver Function Test', 'Chemistry', 'Blood', 1200, 6, 'U/L', 7, 56, 0, 500);
  await upsertSimpleTest('RFT', 'Renal Function Test', 'Chemistry', 'Blood', 1100, 6, 'mg/dL', 0.6, 1.3, 0.1, 10);
  await upsertSimpleTest('LIPID', 'Lipid Profile', 'Chemistry', 'Blood', 1500, 6, 'mg/dL', 0, 200, 0, 500);
  await upsertSimpleTest('URINE', 'Urine Routine Examination', 'Microscopy', 'Urine', 400, 2, '', 0, 0, 0, 0);

  // ----- CBC multi-parameter panel -----
  const cbc = await prisma.test.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'CBC' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'CBC',
      name: 'Complete Blood Count',
      category: 'Haematology',
      sampleType: 'Blood',
      basePrice: 800,
      turnaroundHours: 4,
      isActive: true,
      isPanel: true,
      parameters: {
        create: [
          {
            code: 'WBC',
            name: 'White Blood Cells',
            valueType: ParameterValueType.NUMERIC,
            unit: 'x10^3/uL',
            sortOrder: 0,
            isRequired: true,
            decimalPlaces: 1,
            referenceRanges: {
              create: [{ gender: null, ageMinMonths: 216, lowNormal: 4.0, highNormal: 11.0, criticalLow: 2.0, criticalHigh: 30.0, unit: 'x10^3/uL' }],
            },
          },
          {
            code: 'RBC',
            name: 'Red Blood Cells',
            valueType: ParameterValueType.NUMERIC,
            unit: 'x10^6/uL',
            sortOrder: 1,
            isRequired: true,
            decimalPlaces: 2,
            referenceRanges: {
              create: [
                { gender: 'MALE', ageMinMonths: 216, lowNormal: 4.5, highNormal: 5.5, criticalLow: 2.5, criticalHigh: 7.0, unit: 'x10^6/uL' },
                { gender: 'FEMALE', ageMinMonths: 216, lowNormal: 4.0, highNormal: 5.0, criticalLow: 2.5, criticalHigh: 7.0, unit: 'x10^6/uL' },
              ],
            },
          },
          {
            code: 'HGB',
            name: 'Hemoglobin',
            valueType: ParameterValueType.NUMERIC,
            unit: 'g/dL',
            sortOrder: 2,
            isRequired: true,
            decimalPlaces: 1,
            referenceRanges: {
              create: [
                { gender: 'MALE', ageMinMonths: 216, lowNormal: 13.0, highNormal: 17.0, criticalLow: 7.0, criticalHigh: 20.0, unit: 'g/dL' },
                { gender: 'FEMALE', ageMinMonths: 216, lowNormal: 12.0, highNormal: 15.0, criticalLow: 7.0, criticalHigh: 20.0, unit: 'g/dL' },
              ],
            },
          },
          {
            code: 'HCT',
            name: 'Hematocrit',
            valueType: ParameterValueType.NUMERIC,
            unit: '%',
            sortOrder: 3,
            isRequired: true,
            decimalPlaces: 1,
            referenceRanges: {
              create: [
                { gender: 'MALE', ageMinMonths: 216, lowNormal: 40, highNormal: 50, unit: '%' },
                { gender: 'FEMALE', ageMinMonths: 216, lowNormal: 36, highNormal: 46, unit: '%' },
              ],
            },
          },
          {
            code: 'PLT',
            name: 'Platelets',
            valueType: ParameterValueType.NUMERIC,
            unit: 'x10^3/uL',
            sortOrder: 4,
            isRequired: true,
            decimalPlaces: 0,
            referenceRanges: {
              create: [{ gender: null, ageMinMonths: 216, lowNormal: 150, highNormal: 400, criticalLow: 50, criticalHigh: 1000, unit: 'x10^3/uL' }],
            },
          },
        ],
      },
    },
  });
  console.log('  Tests: single-value + CBC panel (WBC, RBC, HGB, HCT, PLT)');

  // Diabetes package
  if (fbs && hba1c && cbc) {
    await prisma.package.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: 'DIABETES' } },
      update: {},
      create: {
        tenantId: tenant.id,
        code: 'DIABETES',
        name: 'Diabetes Package',
        basePrice: 2500,
        description: 'CBC + FBS + HbA1c',
        isActive: true,
        items: {
          create: [
            { testId: cbc.id, sortOrder: 0 },
            { testId: fbs.id, sortOrder: 1 },
            { testId: hba1c.id, sortOrder: 2 },
          ],
        },
      },
    });
    console.log('  Package: Diabetes Package');
  }

  await prisma.doctor.upsert({
    where: { id: 'seed-doctor-1' },
    update: {},
    create: {
      id: 'seed-doctor-1',
      tenantId: tenant.id,
      fullName: 'Dr. Ahmed Khan',
      phone: '03009876543',
      specialty: 'General Physician',
      shareType: ShareType.PERCENTAGE,
      shareValue: 10,
      isActive: true,
    },
  });
  console.log('  Doctor: Dr. Ahmed Khan');

  // The two automatic transactional SMS events (see @lms/shared
  // sms-events.ts). Seeded with their example wording so the Settings UI
  // has a sensible starting point, but disabled by default — an
  // administrator must review the wording, map an approved SENDPK
  // template, and explicitly enable each event before it can send.
  const smsTemplates = [
    {
      key: 'SAMPLE_COLLECTED',
      name: 'Sample Collection Confirmation',
      body: 'Dear {{patientName}}, your samples have been collected successfully. Booking ID: {{bookingId}}.',
    },
    {
      key: 'REPORT_READY',
      name: 'Report Ready to Collect',
      body: 'Dear {{patientName}}, your report is ready for collection. Booking ID: {{bookingId}}.',
    },
  ];
  for (const t of smsTemplates) {
    await prisma.smsTemplate.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: t.key } },
      update: {},
      create: { tenantId: tenant.id, key: t.key, name: t.name, body: t.body, isActive: false },
    });
  }

  for (const key of ['inventory', 'analyzer_integration', 'whatsapp', 'doctor_portal', 'multi_branch', 'analytics_ai']) {
    await prisma.featureFlag.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key } },
      update: {},
      create: { tenantId: tenant.id, key, enabled: false },
    });
  }

  console.log('\nSeed complete.');
  console.log('Login: admin / admin123  or  operator / admin123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
