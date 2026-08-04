import { FormEvent, useEffect, useState } from 'react';
import * as catalogApi from '../../api/catalog';
import type {
  ParameterChoicePayload,
  ReferenceRangePayload,
  TestParameterPayload,
} from '../../api/catalog';
import type { Test, Package } from '../../types';
import { Loading } from '../../components/Loading';
import { Plus, Trash2 } from 'lucide-react';

function emptyReferenceRange(): ReferenceRangePayload {
  return {};
}

function emptyParameter(): TestParameterPayload {
  return {
    code: '',
    name: '',
    valueType: 'NUMERIC',
    unit: '',
    isRequired: true,
    referenceRanges: [emptyReferenceRange()],
    choices: [],
  };
}

const emptyTestForm = {
  code: '',
  name: '',
  category: '',
  sampleType: '',
  basePrice: '',
  turnaroundHours: '',
  description: '',
  isActive: true,
};

const emptyPackageForm = {
  code: '',
  name: '',
  basePrice: '',
  description: '',
};

export function CatalogPage() {
  const [tests, setTests] = useState<Test[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'tests' | 'packages'>('tests');
  const [expanded, setExpanded] = useState<string | null>(null);

  const [showTestForm, setShowTestForm] = useState(false);
  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [testForm, setTestForm] = useState(emptyTestForm);
  const [parameters, setParameters] = useState<TestParameterPayload[]>([emptyParameter()]);
  const [testSaving, setTestSaving] = useState(false);
  const [testError, setTestError] = useState('');

  const [showPackageForm, setShowPackageForm] = useState(false);
  const [packageForm, setPackageForm] = useState(emptyPackageForm);
  const [packageTestIds, setPackageTestIds] = useState<string[]>([]);
  const [packageSaving, setPackageSaving] = useState(false);
  const [packageError, setPackageError] = useState('');

  function load() {
    setLoading(true);
    Promise.all([catalogApi.listTests(true), catalogApi.listPackages(true)])
      .then(([t, p]) => {
        setTests(t);
        setPackages(p);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  // ----- Test form -----

  function startNewTest() {
    setEditingTestId(null);
    setTestForm(emptyTestForm);
    setParameters([emptyParameter()]);
    setTestError('');
    setShowTestForm(true);
    setExpanded(null);
  }

  function startEditTest(t: Test) {
    setEditingTestId(t.id);
    setTestForm({
      code: t.code,
      name: t.name,
      category: t.category ?? '',
      sampleType: t.sampleType ?? '',
      basePrice: String(t.basePrice),
      turnaroundHours: t.turnaroundHours != null ? String(t.turnaroundHours) : '',
      description: '',
      isActive: t.isActive,
    });
    setParameters(
      t.parameters.length
        ? t.parameters
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((p) => ({
              code: p.code,
              name: p.name,
              valueType: p.valueType as TestParameterPayload['valueType'],
              unit: p.unit ?? '',
              isRequired: p.isRequired,
              decimalPlaces: p.decimalPlaces ?? undefined,
              referenceRanges: p.referenceRanges.length
                ? p.referenceRanges.map((r) => ({
                    gender: (r.gender as ReferenceRangePayload['gender']) ?? undefined,
                    ageMinMonths: r.ageMinMonths ?? undefined,
                    ageMaxMonths: r.ageMaxMonths ?? undefined,
                    lowNormal: r.lowNormal != null ? Number(r.lowNormal) : undefined,
                    highNormal: r.highNormal != null ? Number(r.highNormal) : undefined,
                    criticalLow: r.criticalLow != null ? Number(r.criticalLow) : undefined,
                    criticalHigh: r.criticalHigh != null ? Number(r.criticalHigh) : undefined,
                    unit: r.unit ?? undefined,
                  }))
                : [emptyReferenceRange()],
              choices: p.choices.map((c) => ({ value: c.value, label: c.label })),
            }))
        : [emptyParameter()],
    );
    setTestError('');
    setShowTestForm(true);
    setExpanded(null);
  }

  function updateParameter(idx: number, patch: Partial<TestParameterPayload>) {
    setParameters((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  function addParameter() {
    setParameters((prev) => [...prev, emptyParameter()]);
  }

  function removeParameter(idx: number) {
    setParameters((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateRange(paramIdx: number, rangeIdx: number, patch: Partial<ReferenceRangePayload>) {
    setParameters((prev) =>
      prev.map((p, i) => {
        if (i !== paramIdx) return p;
        const ranges = (p.referenceRanges ?? []).map((r, ri) =>
          ri === rangeIdx ? { ...r, ...patch } : r,
        );
        return { ...p, referenceRanges: ranges };
      }),
    );
  }

  function addRange(paramIdx: number) {
    setParameters((prev) =>
      prev.map((p, i) =>
        i === paramIdx
          ? { ...p, referenceRanges: [...(p.referenceRanges ?? []), emptyReferenceRange()] }
          : p,
      ),
    );
  }

  function removeRange(paramIdx: number, rangeIdx: number) {
    setParameters((prev) =>
      prev.map((p, i) =>
        i === paramIdx
          ? { ...p, referenceRanges: (p.referenceRanges ?? []).filter((_, ri) => ri !== rangeIdx) }
          : p,
      ),
    );
  }

  function updateChoices(paramIdx: number, choices: ParameterChoicePayload[]) {
    setParameters((prev) => prev.map((p, i) => (i === paramIdx ? { ...p, choices } : p)));
  }

  async function handleTestSubmit(e: FormEvent) {
    e.preventDefault();
    setTestSaving(true);
    setTestError('');
    try {
      const cleanParameters = parameters.map((p) => ({
        ...p,
        code: p.code.trim(),
        referenceRanges: (p.referenceRanges ?? []).filter(
          (r) => r.lowNormal != null || r.highNormal != null || r.criticalLow != null || r.criticalHigh != null,
        ),
        choices: p.valueType === 'CHOICE' ? p.choices ?? [] : [],
      }));

      const basePayload = {
        code: testForm.code.trim(),
        name: testForm.name.trim(),
        category: testForm.category || undefined,
        sampleType: testForm.sampleType || undefined,
        basePrice: Number(testForm.basePrice),
        turnaroundHours: testForm.turnaroundHours ? Number(testForm.turnaroundHours) : undefined,
        description: testForm.description || undefined,
        isActive: testForm.isActive,
        isPanel: cleanParameters.length > 1,
      };

      if (editingTestId) {
        await catalogApi.updateTest(editingTestId, basePayload);
        await catalogApi.replaceTestParameters(editingTestId, cleanParameters);
      } else {
        await catalogApi.createTest({ ...basePayload, parameters: cleanParameters });
      }
      setShowTestForm(false);
      load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Save failed';
      setTestError(msg);
    } finally {
      setTestSaving(false);
    }
  }

  // ----- Package form -----

  function togglePackageTest(id: string) {
    setPackageTestIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handlePackageSubmit(e: FormEvent) {
    e.preventDefault();
    setPackageSaving(true);
    setPackageError('');
    try {
      await catalogApi.createPackage({
        code: packageForm.code.trim(),
        name: packageForm.name.trim(),
        basePrice: Number(packageForm.basePrice),
        description: packageForm.description || undefined,
        testIds: packageTestIds,
      });
      setShowPackageForm(false);
      setPackageForm(emptyPackageForm);
      setPackageTestIds([]);
      load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Save failed';
      setPackageError(msg);
    } finally {
      setPackageSaving(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Catalog</h1>
          <p className="text-sm text-slate-500">Tests, panels, and packages</p>
        </div>
        {tab === 'tests' ? (
          <button className="btn-primary" onClick={showTestForm ? () => setShowTestForm(false) : startNewTest}>
            <Plus className="h-4 w-4" />
            {showTestForm ? 'Cancel' : 'New Test'}
          </button>
        ) : (
          <button
            className="btn-primary"
            onClick={() => setShowPackageForm((v) => !v)}
          >
            <Plus className="h-4 w-4" />
            {showPackageForm ? 'Cancel' : 'New Package'}
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <button
          className={tab === 'tests' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setTab('tests')}
        >
          Tests ({tests.length})
        </button>
        <button
          className={tab === 'packages' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setTab('packages')}
        >
          Packages ({packages.length})
        </button>
      </div>

      {tab === 'tests' && showTestForm && (
        <form onSubmit={handleTestSubmit} className="card space-y-5">
          <h2 className="font-semibold text-slate-800">
            {editingTestId ? 'Edit Test' : 'New Test'}
          </h2>
          {testError && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{testError}</div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Code *</label>
              <input
                className="input uppercase"
                required
                value={testForm.code}
                onChange={(e) => setTestForm({ ...testForm, code: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Name *</label>
              <input
                className="input"
                required
                value={testForm.name}
                onChange={(e) => setTestForm({ ...testForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Category</label>
              <input
                className="input"
                value={testForm.category}
                onChange={(e) => setTestForm({ ...testForm, category: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Sample type</label>
              <input
                className="input"
                placeholder="Blood, Urine…"
                value={testForm.sampleType}
                onChange={(e) => setTestForm({ ...testForm, sampleType: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Base price (Rs) *</label>
              <input
                className="input"
                type="number"
                min={0}
                required
                value={testForm.basePrice}
                onChange={(e) => setTestForm({ ...testForm, basePrice: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Turnaround (hours)</label>
              <input
                className="input"
                type="number"
                min={0}
                value={testForm.turnaroundHours}
                onChange={(e) => setTestForm({ ...testForm, turnaroundHours: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Description</label>
              <input
                className="input"
                value={testForm.description}
                onChange={(e) => setTestForm({ ...testForm, description: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 self-end text-sm">
              <input
                type="checkbox"
                checked={testForm.isActive}
                onChange={(e) => setTestForm({ ...testForm, isActive: e.target.checked })}
              />
              Active
            </label>
          </div>

          <div className="space-y-3 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">
                Parameters{' '}
                <span className="text-xs font-normal text-slate-500">
                  (one parameter = single-value test; multiple = panel)
                </span>
              </h3>
              <button type="button" className="btn-secondary text-xs" onClick={addParameter}>
                <Plus className="h-3 w-3" /> Add parameter
              </button>
            </div>

            {parameters.map((p, pIdx) => (
              <div key={pIdx} className="space-y-3 rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="grid flex-1 gap-3 sm:grid-cols-4">
                    <div>
                      <label className="label text-xs">Code *</label>
                      <input
                        className="input uppercase"
                        required
                        value={p.code}
                        onChange={(e) => updateParameter(pIdx, { code: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="label text-xs">Name *</label>
                      <input
                        className="input"
                        required
                        value={p.name}
                        onChange={(e) => updateParameter(pIdx, { name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="label text-xs">Type</label>
                      <select
                        className="input"
                        value={p.valueType}
                        onChange={(e) =>
                          updateParameter(pIdx, {
                            valueType: e.target.value as TestParameterPayload['valueType'],
                          })
                        }
                      >
                        <option value="NUMERIC">Numeric</option>
                        <option value="TEXT">Text</option>
                        <option value="BOOLEAN">Boolean</option>
                        <option value="CHOICE">Choice</option>
                      </select>
                    </div>
                    <div>
                      <label className="label text-xs">Unit</label>
                      <input
                        className="input"
                        value={p.unit}
                        onChange={(e) => updateParameter(pIdx, { unit: e.target.value })}
                      />
                    </div>
                  </div>
                  {parameters.length > 1 && (
                    <button
                      type="button"
                      className="mt-6 text-slate-400 hover:text-red-600"
                      onClick={() => removeParameter(pIdx)}
                      title="Remove parameter"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {p.valueType === 'CHOICE' && (
                  <div className="space-y-1">
                    <label className="label text-xs">Choices (value = label)</label>
                    {(p.choices ?? []).map((c, cIdx) => (
                      <div key={cIdx} className="flex gap-2">
                        <input
                          className="input"
                          placeholder="value e.g. POS"
                          value={c.value}
                          onChange={(e) => {
                            const next = [...(p.choices ?? [])];
                            next[cIdx] = { ...next[cIdx], value: e.target.value };
                            updateChoices(pIdx, next);
                          }}
                        />
                        <input
                          className="input"
                          placeholder="label e.g. Positive"
                          value={c.label}
                          onChange={(e) => {
                            const next = [...(p.choices ?? [])];
                            next[cIdx] = { ...next[cIdx], label: e.target.value };
                            updateChoices(pIdx, next);
                          }}
                        />
                        <button
                          type="button"
                          className="text-slate-400 hover:text-red-600"
                          onClick={() =>
                            updateChoices(pIdx, (p.choices ?? []).filter((_, i) => i !== cIdx))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn-secondary text-xs"
                      onClick={() => updateChoices(pIdx, [...(p.choices ?? []), { value: '', label: '' }])}
                    >
                      <Plus className="h-3 w-3" /> Add choice
                    </button>
                  </div>
                )}

                {p.valueType !== 'TEXT' && p.valueType !== 'CHOICE' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="label text-xs">Reference ranges</label>
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        onClick={() => addRange(pIdx)}
                      >
                        <Plus className="h-3 w-3" /> Add range (e.g. per gender/age)
                      </button>
                    </div>
                    {(p.referenceRanges ?? []).map((r, rIdx) => (
                      <div key={rIdx} className="grid gap-2 rounded-md bg-slate-50 p-2 sm:grid-cols-6">
                        <select
                          className="input"
                          value={r.gender ?? ''}
                          onChange={(e) =>
                            updateRange(pIdx, rIdx, {
                              gender: (e.target.value || undefined) as ReferenceRangePayload['gender'],
                            })
                          }
                        >
                          <option value="">Any gender</option>
                          <option value="MALE">Male</option>
                          <option value="FEMALE">Female</option>
                        </select>
                        <input
                          className="input"
                          type="number"
                          placeholder="Low"
                          value={r.lowNormal ?? ''}
                          onChange={(e) =>
                            updateRange(pIdx, rIdx, {
                              lowNormal: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                        />
                        <input
                          className="input"
                          type="number"
                          placeholder="High"
                          value={r.highNormal ?? ''}
                          onChange={(e) =>
                            updateRange(pIdx, rIdx, {
                              highNormal: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                        />
                        <input
                          className="input"
                          type="number"
                          placeholder="Critical low"
                          value={r.criticalLow ?? ''}
                          onChange={(e) =>
                            updateRange(pIdx, rIdx, {
                              criticalLow: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                        />
                        <input
                          className="input"
                          type="number"
                          placeholder="Critical high"
                          value={r.criticalHigh ?? ''}
                          onChange={(e) =>
                            updateRange(pIdx, rIdx, {
                              criticalHigh: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                        />
                        <button
                          type="button"
                          className="text-slate-400 hover:text-red-600"
                          onClick={() => removeRange(pIdx, rIdx)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <button type="submit" className="btn-primary" disabled={testSaving}>
            {testSaving ? 'Saving…' : editingTestId ? 'Save changes' : 'Create test'}
          </button>
        </form>
      )}

      {tab === 'tests' && !showTestForm && (
        <div className="card space-y-2 p-0 overflow-hidden">
          {tests.map((t) => (
            <div key={t.id} className="border-b border-slate-100 last:border-0">
              <div className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                <button
                  className="flex-1 text-left"
                  onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                >
                  <span className="font-medium text-slate-900">{t.code}</span>
                  <span className="ml-2 text-sm text-slate-600">{t.name}</span>
                  {!t.isActive && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                      inactive
                    </span>
                  )}
                  {t.isPanel && (
                    <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">
                      panel · {t.parameters.length} params
                    </span>
                  )}
                </button>
                <span className="mr-3 text-sm font-medium">
                  Rs {Number(t.basePrice).toLocaleString()}
                </span>
                <button className="btn-secondary text-xs" onClick={() => startEditTest(t)}>
                  Edit
                </button>
              </div>
              {expanded === t.id && t.parameters.length > 0 && (
                <div className="bg-slate-50 px-4 py-3">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-slate-500">
                        <th className="py-1">Code</th>
                        <th className="py-1">Name</th>
                        <th className="py-1">Unit</th>
                        <th className="py-1">Type</th>
                        <th className="py-1">Ranges</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.parameters
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .map((p) => (
                          <tr key={p.id} className="border-t border-slate-200">
                            <td className="py-1.5 font-medium">{p.code}</td>
                            <td className="py-1.5">{p.name}</td>
                            <td className="py-1.5">{p.unit || '—'}</td>
                            <td className="py-1.5">{p.valueType}</td>
                            <td className="py-1.5">
                              {p.referenceRanges.length > 0
                                ? p.referenceRanges
                                    .map(
                                      (r) =>
                                        `${r.lowNormal ?? '—'}–${r.highNormal ?? '—'}${
                                          r.gender ? ` (${r.gender})` : ''
                                        }`,
                                    )
                                    .join(', ')
                                : '—'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'packages' && showPackageForm && (
        <form onSubmit={handlePackageSubmit} className="card space-y-4">
          <h2 className="font-semibold text-slate-800">New Package</h2>
          {packageError && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {packageError}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Code *</label>
              <input
                className="input uppercase"
                required
                value={packageForm.code}
                onChange={(e) => setPackageForm({ ...packageForm, code: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Name *</label>
              <input
                className="input"
                required
                value={packageForm.name}
                onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Package price (Rs) *</label>
              <input
                className="input"
                type="number"
                min={0}
                required
                value={packageForm.basePrice}
                onChange={(e) => setPackageForm({ ...packageForm, basePrice: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Description</label>
              <input
                className="input"
                value={packageForm.description}
                onChange={(e) => setPackageForm({ ...packageForm, description: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label">Included tests *</label>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {tests.map((t) => (
                <label key={t.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={packageTestIds.includes(t.id)}
                    onChange={() => togglePackageTest(t.id)}
                  />
                  <span className="text-sm">
                    {t.code} — {t.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <button
            type="submit"
            className="btn-primary"
            disabled={packageSaving || packageTestIds.length === 0}
          >
            {packageSaving ? 'Saving…' : 'Create package'}
          </button>
        </form>
      )}

      {tab === 'packages' && !showPackageForm && (
        <div className="card space-y-3">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3"
            >
              <div>
                <div className="font-medium">{pkg.name}</div>
                <div className="text-xs text-slate-500">
                  {pkg.items.map((i) => i.test?.code).filter(Boolean).join(' + ') || pkg.code}
                </div>
              </div>
              <span className="font-medium">Rs {Number(pkg.basePrice).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
