import { Client } from 'pg';

// Raw OLD-schema inserts are essential: the V2 generated client cannot select future columns yet.
// Entirely synthetic; no operational rows/passwords or seed script are copied into this fixture.
export async function populateLegacyFixture(c: Client) {
  await c.query(`
    INSERT INTO tenants (id,name,slug,"updatedAt") VALUES
      ('phase-a-tenant','Synthetic Phase A','phase-a',CURRENT_TIMESTAMP),
      ('phase-a-other-tenant','Other synthetic tenant','phase-a-other',CURRENT_TIMESTAMP);
    INSERT INTO branches (id,"tenantId",name,code,"updatedAt") VALUES
      ('phase-a-branch','phase-a-tenant','Fixture branch','A',CURRENT_TIMESTAMP),
      ('phase-a-other-branch','phase-a-other-tenant','Other branch','B',CURRENT_TIMESTAMP);
    INSERT INTO users (id,"tenantId","branchId",username,"passwordHash","fullName",role,"updatedAt") VALUES
      ('legacy-user','phase-a-tenant','phase-a-branch','synthetic','not-a-login-hash','Synthetic actor','LAB_OPERATOR',CURRENT_TIMESTAMP);
    INSERT INTO patients (id,"tenantId","branchId","labNumber","mrcNumber","fullName",phone,"dateOfBirth",gender,"updatedAt") VALUES
      ('legacy-patient','phase-a-tenant','phase-a-branch','LAB-PRESERVE','MRC-PRESERVE','Synthetic patient','03000000001','2000-01-02 00:00:00','UNKNOWN',CURRENT_TIMESTAMP),
      ('legacy-other-patient','phase-a-other-tenant','phase-a-other-branch','LAB-OTHER','MRC-OTHER','Other fixture','03000000002',NULL,NULL,CURRENT_TIMESTAMP);
    INSERT INTO doctors (id,"tenantId","fullName","shareValue","updatedAt") VALUES ('legacy-doctor','phase-a-tenant','Synthetic doctor',12.50,CURRENT_TIMESTAMP);
    INSERT INTO tests (id,"tenantId",code,name,"sampleType","basePrice","isPanel","updatedAt") VALUES
      ('legacy-test-cbc','phase-a-tenant','CBC','Synthetic CBC','Blood',100.10,true,CURRENT_TIMESTAMP),
      ('legacy-test-hba1c','phase-a-tenant','HBA1C','Synthetic HbA1c','Blood',200.25,false,CURRENT_TIMESTAMP);
    INSERT INTO test_parameters (id,"testId",code,name,unit,"sortOrder","decimalPlaces","updatedAt") VALUES
      ('legacy-param-wbc','legacy-test-cbc','WBC','White cells','unit',0,4,CURRENT_TIMESTAMP),
      ('legacy-param-hgb','legacy-test-cbc','HGB','Hemoglobin','g/dL',1,2,CURRENT_TIMESTAMP),
      ('legacy-param-hba1c','legacy-test-hba1c','VALUE','Value','%',0,4,CURRENT_TIMESTAMP);
    INSERT INTO test_reference_ranges (id,"testParameterId",gender,"ageMinMonths","ageMaxMonths","lowNormal","highNormal","criticalLow","criticalHigh",unit,interpretation,"updatedAt") VALUES
      ('legacy-range-wbc','legacy-param-wbc',NULL,NULL,NULL,0.1234,99.9999,0.1000,100.0000,'unit','Keep exact thresholds',CURRENT_TIMESTAMP),
      ('legacy-range-hgb','legacy-param-hgb','FEMALE',12,120,13.5000,18.5000,NULL,NULL,'g/dL',NULL,CURRENT_TIMESTAMP);
    INSERT INTO test_parameter_choices (id,"testParameterId",value,label,"sortOrder") VALUES ('legacy-choice','legacy-param-hba1c','legacy-code','Preserve choice',0);
    INSERT INTO packages (id,"tenantId",code,name,"basePrice","updatedAt") VALUES ('legacy-package','phase-a-tenant','BUNDLE','Synthetic bundle',299.99,CURRENT_TIMESTAMP);
    INSERT INTO package_items (id,"packageId","testId","sortOrder") VALUES
      ('legacy-member-cbc','legacy-package','legacy-test-cbc',0),('legacy-member-hba1c','legacy-package','legacy-test-hba1c',1);
  `);
  const kinds = ['direct','repeat','quantity','package','partial','mismatch'];
  for (const kind of kinds) {
    const mismatch = kind === 'mismatch';
    await c.query(`INSERT INTO bookings (id,"tenantId","branchId","patientId","doctorId",status,"bookingCode","updatedAt") VALUES ($1,$2,$3,$4,$5,'CONVERTED',$6,'2026-10-01 10:00:00')`,
      [`legacy-booking-${kind}`,mismatch?'phase-a-other-tenant':'phase-a-tenant',mismatch?'phase-a-other-branch':'phase-a-branch',mismatch?'legacy-other-patient':'legacy-patient',mismatch?null:'legacy-doctor',`BOOK-${kind}`]);
    const total = ({direct:'300.00',repeat:'200.20',quantity:'300.30',package:'299.99',partial:'0.02',mismatch:'0.01'} as Record<string,string>)[kind];
    await c.query(`INSERT INTO invoices (id,"tenantId","branchId","bookingId",status,"invoiceNumber",subtotal,"discountTotal","grandTotal","amountPaid","amountDue","issuedAt","updatedAt")
      VALUES ($1,'phase-a-tenant','phase-a-branch',$2,'ISSUED',$3,$4,$5,$6,$7,$8,'2026-10-01 10:00:00','2026-10-01 10:00:00')`,
      [`legacy-invoice-${kind}`,`legacy-booking-${kind}`,`INV-${kind}`,kind==='direct'?'300.35':total,kind==='direct'?'0.35':'0',total,kind==='direct'?'100.10':'0',kind==='direct'?'199.90':total]);
  }
  async function line(id: string, invoice: string, test: string|null, pkg: string|null, qty: number, unit: string, total: string, discount='0', sort=0) {
    await c.query(`INSERT INTO invoice_lines (id,"invoiceId","testId","packageId",description,quantity,"unitPrice","basePrice","discountAmount","lineTotal","sortOrder") VALUES ($1,$2,$3,$4,'Synthetic line',$5,$6,$6,$7,$8,$9)`,[id,invoice,test,pkg,qty,unit,discount,total,sort]);
  }
  await line('legacy-line-direct-cbc','legacy-invoice-direct','legacy-test-cbc',null,1,'100.10','100.10');
  await line('legacy-line-direct-hba1c','legacy-invoice-direct','legacy-test-hba1c',null,1,'200.25','199.90','0.35',1);
  await line('legacy-line-repeat-1','legacy-invoice-repeat','legacy-test-cbc',null,1,'100.10','100.10');
  await line('legacy-line-repeat-2','legacy-invoice-repeat','legacy-test-cbc',null,1,'100.10','100.10','0',1);
  await line('legacy-line-quantity','legacy-invoice-quantity','legacy-test-cbc',null,3,'100.10','300.30');
  await line('legacy-line-package','legacy-invoice-package',null,'legacy-package',1,'299.99','299.99');
  await line('legacy-line-no-target','legacy-invoice-partial',null,null,1,'0.01','0.01');
  await line('legacy-line-both-targets','legacy-invoice-partial','legacy-test-cbc','legacy-package',0,'0.01','0.01','0',1);
  await c.query(`
    INSERT INTO payments (id,"invoiceId",amount,method,status,"receivedAt","updatedAt") VALUES ('legacy-payment','legacy-invoice-direct',100.10,'CASH','PARTIALLY_RECEIVED','2026-10-01 10:01:00',CURRENT_TIMESTAMP);
    INSERT INTO doctor_shares (id,"tenantId","doctorId","invoiceId","shareType","rateOrAmount","calculatedAmount","updatedAt") VALUES ('legacy-share','phase-a-tenant','legacy-doctor','legacy-invoice-direct','PERCENTAGE',12.50,37.50,CURRENT_TIMESTAMP);
    INSERT INTO notifications (id,"tenantId",recipient,body,status,"relatedType","relatedId","templateKey","updatedAt") VALUES ('legacy-notification','phase-a-tenant','03000000001','Synthetic fixture only','SENT','Booking','legacy-booking-direct','SAMPLE_COLLECTED',CURRENT_TIMESTAMP);
    INSERT INTO samples (id,"tenantId","branchId","invoiceId","sampleCode",status,"sampleType","collectedById","collectedAt","receivedAt","acceptedAt","rejectedAt","rejectionReason","updatedAt") VALUES
      ('legacy-sample-direct','phase-a-tenant','phase-a-branch','legacy-invoice-direct','SP-DIRECT','ACCEPTED','Blood','legacy-user','2026-10-01 10:02:00','2026-10-01 10:03:00','2026-10-01 10:04:00',NULL,NULL,CURRENT_TIMESTAMP),
      ('legacy-sample-repeat','phase-a-tenant','phase-a-branch','legacy-invoice-repeat','SP-REPEAT','REJECTED','Blood','legacy-user','2026-10-01 10:02:00','2026-10-01 10:03:00',NULL,'2026-10-01 10:04:00','Synthetic rejection',CURRENT_TIMESTAMP),
      ('legacy-sample-quantity','phase-a-tenant','phase-a-branch','legacy-invoice-quantity','SP-QTY','COLLECTED','Blood',NULL,'2026-10-01 10:02:00',NULL,NULL,NULL,NULL,CURRENT_TIMESTAMP),
      ('legacy-sample-package','phase-a-tenant','phase-a-branch','legacy-invoice-package','SP-PKG','COLLECTED',NULL,NULL,NULL,NULL,NULL,NULL,NULL,CURRENT_TIMESTAMP);
    INSERT INTO results (id,"tenantId","sampleId","invoiceLineId","testId",status,"updatedAt") VALUES
      ('legacy-result-cbc','phase-a-tenant','legacy-sample-direct','legacy-line-direct-cbc','legacy-test-cbc','RELEASED',CURRENT_TIMESTAMP),
      ('legacy-result-hba1c','phase-a-tenant','legacy-sample-direct','legacy-line-direct-hba1c','legacy-test-hba1c','ENTERED',CURRENT_TIMESTAMP),
      ('legacy-result-repeat','phase-a-tenant','legacy-sample-repeat','legacy-line-repeat-1','legacy-test-cbc','ENTERED',CURRENT_TIMESTAMP),
      ('legacy-result-quantity','phase-a-tenant','legacy-sample-quantity','legacy-line-quantity','legacy-test-cbc','ENTERED',CURRENT_TIMESTAMP);
    INSERT INTO result_values (id,"resultId","testParameterId","valueNumeric",flag,"updatedAt") VALUES
      ('legacy-value-cbc','legacy-result-cbc','legacy-param-wbc',0.123399,'LOW',CURRENT_TIMESTAMP),
      ('legacy-value-hba1c','legacy-result-hba1c','legacy-param-hba1c',7.654321,'NORMAL',CURRENT_TIMESTAMP),
      ('legacy-value-repeat','legacy-result-repeat','legacy-param-wbc',9.876543,'NORMAL',CURRENT_TIMESTAMP),
      ('legacy-value-quantity','legacy-result-quantity','legacy-param-wbc',1.234567,'NORMAL',CURRENT_TIMESTAMP);
    INSERT INTO reports (id,"tenantId","branchId","invoiceId",status,"reportNumber","trackingId","printCount","printedAt","updatedAt") VALUES
      ('legacy-report','phase-a-tenant','phase-a-branch','legacy-invoice-direct','PARTIAL_READY','RPT-PRESERVE','TRACK-PRESERVE',2,'2026-10-01 11:00:00',CURRENT_TIMESTAMP);
  `);
}
