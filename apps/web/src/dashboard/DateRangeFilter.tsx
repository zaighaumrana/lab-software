import { useState } from 'react';

export type RangePreset = 'today' | 'week' | 'month' | 'year' | 'custom';

export interface DateRangeValue {
  preset: RangePreset;
  from?: string; // ISO yyyy-mm-dd
  to?: string;
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function presetToRange(preset: RangePreset): { from?: string; to?: string } {
  const now = new Date();
  const today = toISODate(now);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'week': {
      const from = new Date(now);
      from.setDate(now.getDate() - 7);
      return { from: toISODate(from), to: today };
    }
    case 'month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toISODate(from), to: today };
    }
    case 'year': {
      const from = new Date(now.getFullYear(), 0, 1);
      return { from: toISODate(from), to: today };
    }
    case 'custom':
    default:
      return {};
  }
}

/**
 * Shared date-range control — drives every widget on a dashboard page from
 * one piece of state, same pattern already proven on the Doctor Dashboard.
 * Any dashboard page composes this once and passes the resulting
 * {from, to} down to whichever widgets it renders.
 */
export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
}) {
  const [customFrom, setCustomFrom] = useState(value.from ?? '');
  const [customTo, setCustomTo] = useState(value.to ?? '');

  function applyPreset(preset: RangePreset) {
    if (preset === 'custom') {
      onChange({ preset, from: customFrom || undefined, to: customTo || undefined });
      return;
    }
    onChange({ preset, ...presetToRange(preset) });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex gap-2">
        {(
          [
            ['today', 'Today'],
            ['week', 'This Week'],
            ['month', 'This Month'],
            ['year', 'This Year'],
            ['custom', 'Custom'],
          ] as [RangePreset, string][]
        ).map(([preset, label]) => (
          <button
            key={preset}
            className={value.preset === preset ? 'btn-primary text-xs' : 'btn-secondary text-xs'}
            onClick={() => applyPreset(preset)}
          >
            {label}
          </button>
        ))}
      </div>
      {value.preset === 'custom' && (
        <>
          <div>
            <label className="label text-xs">From</label>
            <input
              className="input"
              type="date"
              value={customFrom}
              onChange={(e) => {
                setCustomFrom(e.target.value);
                onChange({ preset: 'custom', from: e.target.value || undefined, to: customTo || undefined });
              }}
            />
          </div>
          <div>
            <label className="label text-xs">To</label>
            <input
              className="input"
              type="date"
              value={customTo}
              onChange={(e) => {
                setCustomTo(e.target.value);
                onChange({ preset: 'custom', from: customFrom || undefined, to: e.target.value || undefined });
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
