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
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

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

  const [reopenTarget, setReopenTarget] = useState<Result | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [finalizing, setFinalizing] = useState(false);

  function existingResultFor(sample: Sample, testId: string): Result | undefined {
    return sample.results?.find(
      (r) => r.testId === testId && (r.status === 'ENTERED' || r.status === 'RELEASED'),
    );
  }

  function openResultEntry(sample: Sample, test: Test) {
    setSelected(sample);
    setActiveTest(test);
    const existing = existingResultFor(sample, test.id);
    const initial: Record<string, string> = {};
    test.parameters.forEach((p) => {
      const existingValue = existing?.values.find((v) => v.testParameterId === p.id);
      initial[p.id] =
        existingValue?.valueNumeric != null
          ? String(existingValue.valueNumeric)
          : existingValue?.valueText ?? '';
    });
    setValues(initial);
    setMessage('');
    setError('');
  }

  async function submitResult(finalize: boolean) {
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
        releaseImmediately: finalize,
      });
      setMessage(
        finalize
          ? `Result finalized${result.isCritical ? ' — CRITICAL VALUE DETECTED' : ''}`
          : 'Result saved. Finalize when ready to include it in the report.',
      );
      setActiveTest(null);
      await refresh();
      const updated = await labApi.getSample(selected.id);
      setSelected(updated as Sample);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to save result';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function finalizeExisting(resultId: string) {
    setFinalizing(true);
    setError('');
    try {
      await labApi.finalizeResult(resultId);
      setMessage('Result finalized.');
      await refresh();
      if (selected) {
        const updated = await labApi.getSample(selected.id);
        setSelected(updated as Sample);
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to finalize result';
      setError(msg);
    } finally {
      setFinalizing(false);
    }
  }

  async function submitReopen() {
    if (!reopenTarget || !reopenReason.trim()) return;
    setFinalizing(true);
    setError('');
    try {
      await labApi.reopenResult(reopenTarget.id, reopenReason.trim());
      setMessage('Result reopened for editing.');
      setReopenTarget(null);
      setReopenReason('');
      await refresh();
      if (selected) {
        const updated = await labApi.getSample(selected.id);
        setSelected(updated as Sample);
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to reopen result';
      setError(msg);
    } finally {
      setFinalizing(false);
    }
  }

  const STATUS_LABELS: Record<string, string> = {
    PENDING_COLLECTION: 'Pending Collection',
    COLLECTED: 'Collected',
    IN_TRANSIT: 'In Transit',
    RECEIVED_AT_LAB: 'Received',
    ACCEPTED: 'Accepted',
    IN_TESTING: 'In Testing',
  };

  const statusCounts = samples.reduce<Record<string, number>>((acc, s) => {
    acc[s.status] = (acc[s.status] ?? 0) + 1;
    return acc;
  }, {});

  const filteredSamples = samples.filter((s) => {
    if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      const haystack = `${s.invoice?.booking?.patient?.fullName ?? ''} ${s.sampleCode}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

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
          <div className="card flex flex-col gap-3 p-0 overflow-hidden">
            <div className="space-y-2 border-b border-slate-200 bg-slate-50 p-3">
              <input
                className="input"
                placeholder="Search patient or sample code…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <div className="flex flex-wrap gap-1.5">
                <button
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    statusFilter === 'ALL' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                  onClick={() => setStatusFilter('ALL')}
                >
                  All ({samples.length})
                </button>
                {Object.entries(STATUS_LABELS).map(([status, label]) =>
                  statusCounts[status] ? (
                    <button
                      key={status}
                      className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                        statusFilter === status
                          ? 'bg-brand-600 text-white'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                      onClick={() => setStatusFilter(status)}
                    >
                      {label} ({statusCounts[status]})
                    </button>
                  ) : null,
                )}
              </div>
            </div>
            <div className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto">
              {filteredSamples.length === 0 && (
                <p className="p-4 text-sm text-slate-400">No samples match this filter.</p>
              )}
              {filteredSamples.map((s) => (
                <button
                  key={s.id}
                  className={`flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
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
                    <h3 className="text-sm font-semibold">Tests</h3>
                    {selected.invoice?.lines
                      ?.filter((l) => l.testId)
                      .map((line) => {
                        const test = tests.find((t) => t.id === line.testId);
                        if (!test) return null;
                        const existing = existingResultFor(selected, test.id);
                        const isFinalized = existing?.status === 'RELEASED';
                        const isEntered = existing?.status === 'ENTERED';

                        return (
                          <div
                            key={line.id}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <button
                                className="flex-1 text-left hover:text-brand-700"
                                onClick={() => !isFinalized && openResultEntry(selected, test)}
                                disabled={isFinalized}
                              >
                                {test.code} — {test.name}
                              </button>
                              <span
                                className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                                  isFinalized
                                    ? 'bg-green-100 text-green-700'
                                    : isEntered
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {isFinalized ? 'Finalized' : isEntered ? 'Entered' : 'Not entered'}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-3">
                              {!existing && (
                                <button
                                  className="text-xs text-brand-600 hover:underline"
                                  onClick={() => openResultEntry(selected, test)}
                                >
                                  Enter result →
                                </button>
                              )}
                              {isEntered && (
                                <>
                                  <button
                                    className="text-xs text-brand-600 hover:underline"
                                    onClick={() => openResultEntry(selected, test)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="text-xs text-green-700 hover:underline"
                                    disabled={finalizing}
                                    onClick={() => finalizeExisting(existing.id)}
                                  >
                                    Finalize
                                  </button>
                                </>
                              )}
                              {isFinalized && (
                                <button
                                  className="text-xs text-amber-700 hover:underline"
                                  onClick={() => {
                                    setReopenTarget(existing);
                                    setReopenReason('');
                                  }}
                                >
                                  Reopen
                                </button>
                              )}
                            </div>
                          </div>
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
                    <div className="flex gap-2">
                      <button
                        className="btn-secondary flex-1"
                        onClick={() => submitResult(false)}
                        disabled={saving}
                      >
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        className="btn-primary flex-1"
                        onClick={() => submitResult(true)}
                        disabled={saving}
                      >
                        {saving ? 'Saving…' : 'Save & Finalize'}
                      </button>
                    </div>
                    <button
                      className="w-full text-center text-xs text-slate-400 hover:text-slate-600"
                      onClick={() => setActiveTest(null)}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {reopenTarget && (
                  <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4">
                    <h3 className="text-sm font-semibold text-amber-900">
                      Reopen {reopenTarget.test?.code} — a reason is required
                    </h3>
                    <input
                      className="input"
                      placeholder="e.g. Value transcribed incorrectly"
                      value={reopenReason}
                      onChange={(e) => setReopenReason(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button
                        className="btn-secondary flex-1"
                        onClick={() => setReopenTarget(null)}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn-primary flex-1"
                        disabled={finalizing || !reopenReason.trim()}
                        onClick={submitReopen}
                      >
                        {finalizing ? 'Reopening…' : 'Confirm reopen'}
                      </button>
                    </div>
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
