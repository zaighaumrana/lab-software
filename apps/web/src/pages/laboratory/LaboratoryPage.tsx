import { useEffect, useState } from 'react';
import * as labApi from '../../api/laboratory';
import * as catalogApi from '../../api/catalog';
import type { Sample, Test, Result } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import { Loading } from '../../components/Loading';
import { EmptyState } from '../../components/EmptyState';

export function LaboratoryPage() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Sample | null>(null);
  const [tests, setTests] = useState<Test[]>([]);
  const [activeTest, setActiveTest] = useState<Test | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showOutsourceForm, setShowOutsourceForm] = useState(false);
  const [outsourceLab, setOutsourceLab] = useState('');
  const [outsourceCost, setOutsourceCost] = useState('');
  const [outsourcing, setOutsourcing] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const data = await labApi.listPendingSamples();
      setSamples(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    catalogApi.listTests().then(setTests);
  }, []);

  async function advanceSample(sample: Sample, action: 'receive' | 'accept') {
    setError('');
    try {
      if (action === 'receive') await labApi.receiveSample(sample.id);
      if (action === 'accept') await labApi.acceptSample(sample.id);
      await refresh();
      const updated = await labApi.getSample(sample.id);
      setSelected(updated as Sample);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Action failed';
      setError(msg);
    }
  }

  async function submitOutsource() {
    if (!selected || !outsourceLab.trim()) return;
    setOutsourcing(true);
    setError('');
    try {
      const updated = await labApi.outsourceSample(selected.id, {
        externalLabName: outsourceLab.trim(),
        outsourcingCost: outsourceCost ? Number(outsourceCost) : undefined,
      });
      setSelected(updated);
      setShowOutsourceForm(false);
      setOutsourceLab('');
      setOutsourceCost('');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Could not mark as outsourced';
      setError(msg);
    } finally {
      setOutsourcing(false);
    }
  }

  async function removeOutsource() {
    if (!selected) return;
    setOutsourcing(true);
    setError('');
    try {
      const updated = await labApi.unOutsourceSample(selected.id);
      setSelected(updated);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Could not remove outsourcing';
      setError(msg);
    } finally {
      setOutsourcing(false);
    }
  }

  function openResultEntry(sample: Sample, test: Test) {
    setSelected(sample);
    setActiveTest(test);
    const initial: Record<string, string> = {};
    test.parameters.forEach((p) => {
      initial[p.id] = '';
    });
    setValues(initial);
    setMessage('');
    setError('');
  }

  async function submitResult() {
    if (!selected || !activeTest) return;
    const invoiceLine = selected.invoice?.lines?.find(
      (l) => l.testId === activeTest.id,
    );
    if (!invoiceLine) {
      setError('No matching invoice line for this test');
      return;
    }

    const payloadValues = activeTest.parameters
      .filter((p) => values[p.id] !== undefined && values[p.id] !== '')
      .map((p) => ({
        testParameterId: p.id,
        valueNumeric:
          p.valueType === 'NUMERIC' || !p.valueType
            ? Number(values[p.id])
            : undefined,
        valueText:
          p.valueType === 'TEXT' || p.valueType === 'CHOICE'
            ? values[p.id]
            : undefined,
        unit: p.unit ?? undefined,
      }));

    if (payloadValues.length === 0) {
      setError('Enter at least one value');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const result: Result = await labApi.enterResult({
        sampleId: selected.id,
        invoiceLineId: invoiceLine.id,
        testId: activeTest.id,
        values: payloadValues,
        releaseImmediately: true,
      });
      setMessage(
        `Result released${result.isCritical ? ' — CRITICAL VALUE DETECTED' : ''}`,
      );
      setActiveTest(null);
      await refresh();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to save result';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Laboratory</h1>
          <p className="text-sm text-slate-500">Sample queue & result entry</p>
        </div>
        <button className="btn-secondary" onClick={refresh}>
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {message && (
        <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          {message}
        </div>
      )}

      {loading && <Loading />}

      {!loading && samples.length === 0 && (
        <EmptyState
          title="No pending samples"
          description="Samples appear here after collection during a visit."
        />
      )}

      {!loading && samples.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card space-y-2 p-0 overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase text-slate-500">
              Queue
            </div>
            {samples.map((s) => (
              <button
                key={s.id}
                className={`flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50 ${
                  selected?.id === s.id ? 'bg-brand-50' : ''
                }`}
                onClick={() => {
                  setSelected(s);
                  setActiveTest(null);
                  setShowOutsourceForm(false);
                }}
              >
                <div>
                  <div className="text-sm font-medium">
                    {s.invoice?.booking?.patient?.fullName ?? s.sampleCode}
                  </div>
                  <div className="text-xs text-slate-500">
                    {s.sampleCode}
                    {s.isOutsourced && (
                      <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                        Outsourced
                      </span>
                    )}
                  </div>
                </div>
                <StatusBadge status={s.status} />
              </button>
            ))}
          </div>

          <div className="card space-y-4">
            {!selected && (
              <p className="text-sm text-slate-500">Select a sample from the queue</p>
            )}

            {selected && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">
                      {selected.invoice?.booking?.patient?.fullName}
                    </div>
                    <div className="text-xs text-slate-500">{selected.sampleCode}</div>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>

                <div className="rounded-lg border border-slate-200 p-3 text-sm">
                  {selected.isOutsourced ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                          Outsourced
                        </span>
                        <span className="ml-2 text-slate-700">{selected.externalLabName}</span>
                        {selected.outsourcingCost != null && (
                          <span className="ml-2 text-xs text-slate-500">
                            Cost: Rs {Number(selected.outsourcingCost).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <button
                        className="btn-secondary text-xs"
                        onClick={removeOutsource}
                        disabled={outsourcing}
                      >
                        Remove
                      </button>
                    </div>
                  ) : showOutsourceForm ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <div>
                        <label className="label text-xs">External lab *</label>
                        <input
                          className="input"
                          value={outsourceLab}
                          onChange={(e) => setOutsourceLab(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="label text-xs">Cost (Rs)</label>
                        <input
                          className="input w-28"
                          type="number"
                          min={0}
                          value={outsourceCost}
                          onChange={(e) => setOutsourceCost(e.target.value)}
                        />
                      </div>
                      <button
                        className="btn-primary text-xs"
                        onClick={submitOutsource}
                        disabled={outsourcing || !outsourceLab.trim()}
                      >
                        {outsourcing ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        className="btn-secondary text-xs"
                        onClick={() => setShowOutsourceForm(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="text-xs text-brand-600 hover:underline"
                      onClick={() => setShowOutsourceForm(true)}
                    >
                      Send this sample to an external lab
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {selected.status === 'COLLECTED' && (
                    <button
                      className="btn-primary text-xs"
                      onClick={() => advanceSample(selected, 'receive')}
                    >
                      Mark Received
                    </button>
                  )}
                  {selected.status === 'RECEIVED_AT_LAB' && (
                    <button
                      className="btn-primary text-xs"
                      onClick={() => advanceSample(selected, 'accept')}
                    >
                      Accept Sample
                    </button>
                  )}
                </div>

                {(selected.status === 'ACCEPTED' ||
                  selected.status === 'IN_TESTING') && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Enter results</h3>
                    {selected.invoice?.lines
                      ?.filter((l) => l.testId)
                      .map((line) => {
                        const test = tests.find((t) => t.id === line.testId);
                        if (!test) return null;
                        return (
                          <button
                            key={line.id}
                            className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-brand-400"
                            onClick={() => openResultEntry(selected, test)}
                          >
                            <span>
                              {test.code} — {test.name}
                            </span>
                            <span className="text-xs text-brand-600">Enter →</span>
                          </button>
                        );
                      })}
                  </div>
                )}

                {activeTest && (
                  <div className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/50 p-4">
                    <h3 className="font-semibold">
                      {activeTest.code} — {activeTest.name}
                    </h3>
                    {activeTest.parameters
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((p) => (
                        <div key={p.id}>
                          <label className="label">
                            {p.name}
                            {p.unit ? ` (${p.unit})` : ''}
                            {p.isRequired ? ' *' : ''}
                          </label>
                          <input
                            className="input"
                            type={p.valueType === 'TEXT' ? 'text' : 'number'}
                            step="any"
                            value={values[p.id] ?? ''}
                            onChange={(e) =>
                              setValues({ ...values, [p.id]: e.target.value })
                            }
                          />
                        </div>
                      ))}
                    <button
                      className="btn-primary w-full"
                      onClick={submitResult}
                      disabled={saving}
                    >
                      {saving ? 'Saving…' : 'Save & Release Result'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
