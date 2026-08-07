import { FormEvent, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as patientsApi from '../../api/patients';
import * as catalogApi from '../../api/catalog';
import * as doctorsApi from '../../api/doctors';
import * as bookingsApi from '../../api/bookings';
import * as billingApi from '../../api/billing';
import * as labApi from '../../api/laboratory';
import type { Patient, Test, Package, Doctor, Booking, Invoice } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import { Loading } from '../../components/Loading';

type Step = 'patient' | 'tests' | 'payment' | 'done';

const emptyNewPatientForm = {
  fullName: '',
  cnic: '',
  gender: '',
  dateOfBirth: '',
  address: '',
};

function money(n: number | string | undefined) {
  return `Rs ${Number(n ?? 0).toLocaleString()}`;
}

export function VisitPage() {
  const [params] = useSearchParams();
  const preselectedPatientId = params.get('patientId');

  const [step, setStep] = useState<Step>('patient');

  // Phone-first patient lookup
  const [phone, setPhone] = useState('');
  const [phoneLookupLoading, setPhoneLookupLoading] = useState(false);
  const [matchedPatients, setMatchedPatients] = useState<Patient[]>([]);
  const [lookupDone, setLookupDone] = useState(false);
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  const [newPatientForm, setNewPatientForm] = useState(emptyNewPatientForm);
  const [registering, setRegistering] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fallback name/CNIC search
  const [showNameSearch, setShowNameSearch] = useState(false);
  const [nameQuery, setNameQuery] = useState('');
  const [nameResults, setNameResults] = useState<Patient[]>([]);
  const [nameSearchLoading, setNameSearchLoading] = useState(false);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [tests, setTests] = useState<Test[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [selectedPackageIds, setSelectedPackageIds] = useState<string[]>([]);
  const [discounts, setDiscounts] = useState<Record<string, string>>({});
  const [discountReasons, setDiscountReasons] = useState<Record<string, string>>({});
  const [doctorId, setDoctorId] = useState('');
  const [booking, setBooking] = useState<Booking | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sampleId, setSampleId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      catalogApi.listTests(),
      catalogApi.listPackages(),
      doctorsApi.listDoctors(),
    ]).then(([t, p, d]) => {
      setTests(t);
      setPackages(p);
      setDoctors(d);
    });
  }, []);

  useEffect(() => {
    if (preselectedPatientId) {
      patientsApi.getPatient(preselectedPatientId).then((p) => {
        setPatient(p);
        setStep('tests');
      });
    }
  }, [preselectedPatientId]);

  // Auto-lookup existing patient as soon as a plausible phone number is typed.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLookupDone(false);
    setMatchedPatients([]);
    setShowNewPatientForm(false);

    const digits = phone.replace(/\D/g, '');
    if (digits.length < 11) return;

    debounceRef.current = setTimeout(async () => {
      setPhoneLookupLoading(true);
      try {
        const results = await patientsApi.searchPatients(phone.trim());
        const exact = results.filter((p) => p.phone === phone.trim() || p.phoneAlt === phone.trim());
        setMatchedPatients(exact.length ? exact : results);
        setLookupDone(true);
        if (exact.length === 0) {
          setNewPatientForm({ ...emptyNewPatientForm });
          setShowNewPatientForm(true);
        }
      } catch {
        setLookupDone(true);
      } finally {
        setPhoneLookupLoading(false);
      }
    }, 450);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [phone]);

  function selectPatient(p: Patient) {
    setPatient(p);
    setStep('tests');
  }

  async function handleRegisterNewPatient(e: FormEvent) {
    e.preventDefault();
    setRegistering(true);
    setError('');
    try {
      const p = await patientsApi.createPatient({
        fullName: newPatientForm.fullName,
        phone: phone.trim(),
        cnic: newPatientForm.cnic || undefined,
        gender: newPatientForm.gender || undefined,
        dateOfBirth: newPatientForm.dateOfBirth || undefined,
        address: newPatientForm.address || undefined,
      });
      selectPatient(p);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Registration failed';
      setError(msg);
    } finally {
      setRegistering(false);
    }
  }

  async function searchByName() {
    if (nameQuery.trim().length < 2) return;
    setNameSearchLoading(true);
    try {
      const data = await patientsApi.searchPatients(nameQuery.trim());
      setNameResults(data);
    } finally {
      setNameSearchLoading(false);
    }
  }

  function toggleTest(id: string) {
    setSelectedTestIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function togglePackage(id: string) {
    setSelectedPackageIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function lineDiscount(id: string, basePrice: number) {
    const raw = Number(discounts[id] || 0);
    if (!raw || raw <= 0) return 0;
    return Math.min(raw, basePrice);
  }

  const estimatedTotal =
    selectedTestIds.reduce((sum, id) => {
      const t = tests.find((x) => x.id === id);
      const base = Number(t?.basePrice ?? 0);
      return sum + (base - lineDiscount(id, base));
    }, 0) +
    selectedPackageIds.reduce((sum, id) => {
      const p = packages.find((x) => x.id === id);
      const base = Number(p?.basePrice ?? 0);
      return sum + (base - lineDiscount(id, base));
    }, 0);

  async function createVisit() {
    if (!patient) return;
    if (selectedTestIds.length === 0 && selectedPackageIds.length === 0) {
      setError('Select at least one test or package');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const b = await bookingsApi.createBooking({
        patientId: patient.id,
        doctorId: doctorId || undefined,
        source: 'WALK_IN',
      });
      await bookingsApi.checkInBooking(b.id);
      setBooking(b);

      const lines = [
        ...selectedTestIds.map((testId) => {
          const t = tests.find((x) => x.id === testId);
          const discount = lineDiscount(testId, Number(t?.basePrice ?? 0));
          return {
            testId,
            quantity: 1,
            manualDiscount: discount > 0 ? discount : undefined,
            manualDiscountReason: discount > 0 ? discountReasons[testId] || undefined : undefined,
          };
        }),
        ...selectedPackageIds.map((packageId) => {
          const p = packages.find((x) => x.id === packageId);
          const discount = lineDiscount(packageId, Number(p?.basePrice ?? 0));
          return {
            packageId,
            quantity: 1,
            manualDiscount: discount > 0 ? discount : undefined,
            manualDiscountReason: discount > 0 ? discountReasons[packageId] || undefined : undefined,
          };
        }),
      ];
      const inv = await billingApi.createInvoice({
        bookingId: b.id,
        lines,
      });
      setInvoice(inv);
      setPayAmount(String(inv.grandTotal));
      setStep('payment');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to create visit';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handlePayment() {
    if (!invoice) return;
    setLoading(true);
    setError('');
    try {
      const result = await billingApi.recordPayment(invoice.id, {
        amount: Number(payAmount),
        method: payMethod,
      });
      setInvoice(result.invoice);

      // Auto-collect sample for convenience
      const sample = await labApi.collectSample({
        invoiceId: result.invoice.id,
        sampleType: 'Blood',
      });
      setSampleId(sample.id);
      setStep('done');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Payment failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function resetAll() {
    setStep('patient');
    setPhone('');
    setMatchedPatients([]);
    setLookupDone(false);
    setShowNewPatientForm(false);
    setNewPatientForm(emptyNewPatientForm);
    setShowNameSearch(false);
    setNameQuery('');
    setNameResults([]);
    setPatient(null);
    setBooking(null);
    setInvoice(null);
    setSelectedTestIds([]);
    setSelectedPackageIds([]);
    setDiscounts({});
    setDiscountReasons({});
    setSampleId(null);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">New Registration</h1>
        <p className="text-sm text-slate-500">
          Phone lookup → confirm/register patient → select tests → invoice & payment
        </p>
      </div>

      {/* Steps indicator */}
      <div className="flex gap-2 text-xs font-medium">
        {(['patient', 'tests', 'payment', 'done'] as Step[]).map((s, i) => (
          <div
            key={s}
            className={`rounded-full px-3 py-1 ${
              step === s
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {i + 1}. {s}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Step: Patient */}
      {step === 'patient' && (
        <div className="space-y-4">
          <div className="card space-y-4">
            <h2 className="font-semibold">Patient phone number</h2>
            <input
              className="input"
              placeholder="03001234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoFocus
            />
            {phoneLookupLoading && <Loading />}

            {!phoneLookupLoading && lookupDone && matchedPatients.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">
                  {matchedPatients.length === 1
                    ? 'Existing patient found:'
                    : `${matchedPatients.length} possible matches:`}
                </p>
                {matchedPatients.map((p) => (
                  <button
                    key={p.id}
                    className="flex w-full items-center justify-between rounded-lg border border-brand-300 bg-brand-50 px-4 py-3 text-left hover:border-brand-500"
                    onClick={() => selectPatient(p)}
                  >
                    <div>
                      <div className="font-medium">{p.fullName}</div>
                      <div className="text-xs text-slate-500">
                        {p.phone} {p.cnic ? `· ${p.cnic}` : ''}
                      </div>
                      <div className="mt-0.5 font-mono text-xs text-slate-400">
                        Lab #{p.labNumber} · MRC #{p.mrcNumber}
                      </div>
                    </div>
                    <span className="text-xs text-brand-700">Use this patient →</span>
                  </button>
                ))}
                <button
                  type="button"
                  className="text-xs text-slate-500 underline"
                  onClick={() => {
                    setShowNewPatientForm(true);
                    setNewPatientForm({ ...emptyNewPatientForm });
                  }}
                >
                  Not them? Register a new patient with this phone number
                </button>
              </div>
            )}

            {!phoneLookupLoading && lookupDone && matchedPatients.length === 0 && !showNewPatientForm && (
              <p className="text-sm text-slate-500">No existing patient with this number.</p>
            )}
          </div>

          {showNewPatientForm && (
            <form onSubmit={handleRegisterNewPatient} className="card space-y-4">
              <h2 className="font-semibold text-slate-800">Register New Patient</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="label">Phone *</label>
                  <input className="input" required value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Full name *</label>
                  <input
                    className="input"
                    required
                    value={newPatientForm.fullName}
                    onChange={(e) => setNewPatientForm({ ...newPatientForm, fullName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">CNIC</label>
                  <input
                    className="input"
                    placeholder="12345-1234567-1"
                    value={newPatientForm.cnic}
                    onChange={(e) => setNewPatientForm({ ...newPatientForm, cnic: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Gender</label>
                  <select
                    className="input"
                    value={newPatientForm.gender}
                    onChange={(e) => setNewPatientForm({ ...newPatientForm, gender: e.target.value })}
                  >
                    <option value="">—</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="label">Date of birth</label>
                  <input
                    className="input"
                    type="date"
                    value={newPatientForm.dateOfBirth}
                    onChange={(e) => setNewPatientForm({ ...newPatientForm, dateOfBirth: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Address</label>
                  <input
                    className="input"
                    value={newPatientForm.address}
                    onChange={(e) => setNewPatientForm({ ...newPatientForm, address: e.target.value })}
                  />
                </div>
              </div>
              <button type="submit" className="btn-primary" disabled={registering}>
                {registering ? 'Saving…' : 'Register & Continue'}
              </button>
            </form>
          )}

          <div className="text-center">
            <button
              type="button"
              className="text-xs text-slate-500 underline"
              onClick={() => setShowNameSearch((v) => !v)}
            >
              {showNameSearch ? 'Hide' : 'Or search by name / CNIC instead'}
            </button>
          </div>

          {showNameSearch && (
            <div className="card space-y-3">
              <div className="flex gap-2">
                <input
                  className="input"
                  placeholder="Search name or CNIC…"
                  value={nameQuery}
                  onChange={(e) => setNameQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchByName()}
                />
                <button className="btn-primary" onClick={searchByName} disabled={nameSearchLoading}>
                  Search
                </button>
              </div>
              {nameSearchLoading && <Loading />}
              <div className="space-y-2">
                {nameResults.map((p) => (
                  <button
                    key={p.id}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left hover:border-brand-400 hover:bg-brand-50"
                    onClick={() => selectPatient(p)}
                  >
                    <div>
                      <div className="font-medium">{p.fullName}</div>
                      <div className="text-xs text-slate-500">{p.phone}</div>
                      <div className="mt-0.5 font-mono text-xs text-slate-400">
                        Lab #{p.labNumber} · MRC #{p.mrcNumber}
                      </div>
                    </div>
                    <span className="text-xs text-brand-600">Select →</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step: Tests */}
      {step === 'tests' && patient && (
        <div className="space-y-4">
          <div className="card flex items-center justify-between">
            <div>
              <div className="font-medium">{patient.fullName}</div>
              <div className="text-sm text-slate-500">{patient.phone}</div>
              <div className="font-mono text-xs text-slate-400">
                Lab #{patient.labNumber} · MRC #{patient.mrcNumber}
              </div>
            </div>
            <button className="btn-secondary text-xs" onClick={() => setStep('patient')}>
              Change
            </button>
          </div>

          <div className="card space-y-3">
            <label className="label">Referring doctor (optional)</label>
            <select
              className="input"
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
            >
              <option value="">— None —</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.fullName}
                </option>
              ))}
            </select>
          </div>

          {packages.length > 0 && (
            <div className="card space-y-3">
              <h3 className="font-semibold">Packages</h3>
              {packages.map((pkg) => {
                const selected = selectedPackageIds.includes(pkg.id);
                const base = Number(pkg.basePrice);
                return (
                  <div key={pkg.id} className="rounded-lg border border-slate-200 px-3 py-2">
                    <label className="flex cursor-pointer items-center gap-3">
                      <input type="checkbox" checked={selected} onChange={() => togglePackage(pkg.id)} />
                      <span className="flex-1 text-sm font-medium">{pkg.name}</span>
                      <span className="text-sm text-slate-600">{money(base)}</span>
                    </label>
                    {selected && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
                        <label className="text-xs text-slate-500">Discount (Rs)</label>
                        <input
                          className="input w-28"
                          type="number"
                          min={0}
                          max={base}
                          value={discounts[pkg.id] ?? ''}
                          onChange={(e) => setDiscounts({ ...discounts, [pkg.id]: e.target.value })}
                        />
                        <input
                          className="input flex-1"
                          placeholder="Reason (optional)"
                          value={discountReasons[pkg.id] ?? ''}
                          onChange={(e) => setDiscountReasons({ ...discountReasons, [pkg.id]: e.target.value })}
                        />
                        <span className="text-xs font-medium text-green-700">
                          Final: {money(base - lineDiscount(pkg.id, base))}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="card space-y-3">
            <h3 className="font-semibold">Tests</h3>
            <div className="max-h-96 space-y-1 overflow-y-auto">
              {tests.map((t) => {
                const selected = selectedTestIds.includes(t.id);
                const base = Number(t.basePrice);
                return (
                  <div key={t.id} className="rounded-lg px-3 py-2 hover:bg-slate-50">
                    <label className="flex cursor-pointer items-center gap-3">
                      <input type="checkbox" checked={selected} onChange={() => toggleTest(t.id)} />
                      <span className="flex-1 text-sm">
                        <span className="font-medium">{t.code}</span> — {t.name}
                        {t.isPanel && <span className="ml-2 text-xs text-purple-600">panel</span>}
                      </span>
                      <span className="text-sm text-slate-600">{money(base)}</span>
                    </label>
                    {selected && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
                        <label className="text-xs text-slate-500">Discount (Rs)</label>
                        <input
                          className="input w-28"
                          type="number"
                          min={0}
                          max={base}
                          value={discounts[t.id] ?? ''}
                          onChange={(e) => setDiscounts({ ...discounts, [t.id]: e.target.value })}
                        />
                        <input
                          className="input flex-1"
                          placeholder="Reason (optional)"
                          value={discountReasons[t.id] ?? ''}
                          onChange={(e) => setDiscountReasons({ ...discountReasons, [t.id]: e.target.value })}
                        />
                        <span className="text-xs font-medium text-green-700">
                          Final: {money(base - lineDiscount(t.id, base))}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card flex items-center justify-between">
            <div className="text-sm">
              Estimated total:{' '}
              <span className="text-lg font-bold">{money(estimatedTotal)}</span>
            </div>
            <button className="btn-primary" onClick={createVisit} disabled={loading}>
              {loading ? 'Creating…' : 'Create Invoice'}
            </button>
          </div>
        </div>
      )}

      {/* Step: Payment */}
      {step === 'payment' && invoice && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Invoice {invoice.invoiceNumber}</h2>
            <StatusBadge status={invoice.status} />
          </div>

          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-slate-500">
                <th className="py-1">Test</th>
                <th className="py-1 text-right">Original</th>
                <th className="py-1 text-right">Discount</th>
                <th className="py-1 text-right">Final</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="py-1.5">{l.description}</td>
                  <td className="py-1.5 text-right">{money(l.basePrice ?? l.unitPrice)}</td>
                  <td className="py-1.5 text-right text-amber-700">
                    {Number(l.discountAmount ?? 0) > 0 ? `- ${money(l.discountAmount)}` : '—'}
                  </td>
                  <td className="py-1.5 text-right font-medium">{money(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-1 border-t border-slate-200 pt-2 text-sm">
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{money(invoice.grandTotal)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Due</span>
              <span>{money(invoice.amountDue)}</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Amount</label>
              <input
                className="input"
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Method</label>
              <select
                className="input"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
              >
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="EASYPAISA">EasyPaisa</option>
                <option value="JAZZCASH">JazzCash</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Amount can be less than the total due — the remaining balance can be collected
            later (e.g. at report collection).
          </p>

          <button className="btn-primary w-full" onClick={handlePayment} disabled={loading}>
            {loading ? 'Processing…' : 'Record Payment & Collect Sample'}
          </button>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && invoice && (
        <div className="card space-y-4 text-center">
          <div className="text-4xl">✓</div>
          <h2 className="text-xl font-semibold text-green-700">Visit Complete</h2>
          <p className="text-sm text-slate-600">
            Invoice <strong>{invoice.invoiceNumber}</strong>
            {sampleId && (
              <>
                <br />
                Sample collected — continue in Laboratory queue
              </>
            )}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a href={`/invoices/${invoice.id}`} className="btn-primary">
              Print invoice / receipt
            </a>
            <a href="/laboratory" className="btn-secondary">
              Go to Laboratory
            </a>
            <button className="btn-secondary" onClick={resetAll}>
              New Registration
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
