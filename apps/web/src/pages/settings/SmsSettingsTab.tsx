import { useEffect, useRef, useState } from 'react';
import * as settingsApi from '../../api/settings';
import type {
  SendPkTemplateOption,
  SmsEventSettings,
  SmsSettings,
} from '../../api/settings';
import {
  calculateSmsSegments,
  extractPlaceholders,
  renderLocalTemplate,
  toSendPkWording,
  SMS_VARIABLE_MAP,
} from '@lms/shared';

const VARIABLE_LABELS: Record<string, string> = {
  patientName: 'Patient Name',
  bookingId: 'Booking ID',
  labName: 'Lab Name',
  trackingId: 'Tracking ID',
};

type MappingStatus =
  | { level: 'ok'; text: string }
  | { level: 'warn'; text: string }
  | { level: 'error'; text: string };

function computeStatus(event: SmsEventSettings): MappingStatus {
  const used = extractPlaceholders(event.body);
  const unknown = used.filter((v) => !(v in SMS_VARIABLE_MAP));

  if (!event.isActive) {
    return { level: 'warn', text: 'Disabled' };
  }
  if (unknown.length > 0) {
    return { level: 'error', text: `Unknown SMS variable: ${unknown.join(', ')}` };
  }
  if (!event.sendpkTemplateId) {
    return {
      level: 'error',
      text: 'Not ready for sending - approve this template in SENDPK and sync templates.',
    };
  }
  const requiredMapped = event.sendpkRequiredVariables
    .map((sendpkVar) => Object.entries(SMS_VARIABLE_MAP).find(([, v]) => v === sendpkVar)?.[0])
    .filter((v): v is string => Boolean(v));
  const missing = requiredMapped.filter((v) => !used.includes(v));
  if (missing.length > 0) {
    return {
      level: 'error',
      text: `SENDPK template requires: ${missing.map((v) => VARIABLE_LABELS[v] ?? v).join(', ')}`,
    };
  }
  return { level: 'ok', text: 'Enabled · Ready' };
}

function StatusBadge({ status }: { status: MappingStatus }) {
  const classes =
    status.level === 'ok'
      ? 'bg-green-50 text-green-700'
      : status.level === 'warn'
        ? 'bg-slate-100 text-slate-600'
        : 'bg-amber-50 text-amber-800';
  return <span className={`badge ${classes}`}>{status.text}</span>;
}

function EventCard({
  event,
  onSaved,
  templateOptions,
}: {
  event: SmsEventSettings;
  onSaved: (updated: SmsEventSettings) => void;
  templateOptions: SendPkTemplateOption[];
}) {
  const [body, setBody] = useState(event.body);
  const [isActive, setIsActive] = useState(event.isActive);
  const [sendpkTemplateId, setSendpkTemplateId] = useState(event.sendpkTemplateId ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setBody(event.body);
    setIsActive(event.isActive);
    setSendpkTemplateId(event.sendpkTemplateId ?? '');
  }, [event]);

  const draftEvent: SmsEventSettings = { ...event, body, isActive, sendpkTemplateId: sendpkTemplateId || null };
  const preview = renderLocalTemplate(body, event.exampleValues);
  const segments = calculateSmsSegments(preview);
  const sendpkPreview = toSendPkWording(body);

  const mappedOption = templateOptions.find((t) => t.id === sendpkTemplateId);
  const requiredVars = mappedOption?.variables ?? event.sendpkRequiredVariables;
  const status = computeStatus({ ...draftEvent, sendpkRequiredVariables: requiredVars });

  function insertVariable(key: string) {
    const el = textareaRef.current;
    const token = `{{${key}}}`;
    if (!el) {
      setBody((b) => b + token);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      const updated = await settingsApi.saveSmsTemplate(event.key, {
        body,
        isActive,
        sendpkTemplateId: sendpkTemplateId || null,
      });
      onSaved({ ...event, ...updated, sendpkRequiredVariables: event.sendpkRequiredVariables });
    } catch (err: unknown) {
      setSaveError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Failed to save template',
      );
    } finally {
      setSaving(false);
    }
  }

  function copySendPkWording() {
    navigator.clipboard?.writeText(sendpkPreview).catch(() => {});
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{event.label}</h3>
          <p className="text-xs text-slate-500">Event key: {event.key}</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Send this SMS
        </label>
      </div>

      <StatusBadge status={status} />

      <div>
        <label className="label">Template</label>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {event.variables.map((v) => (
            <button
              key={v}
              type="button"
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              onClick={() => insertVariable(v)}
            >
              + {VARIABLE_LABELS[v] ?? v}
            </button>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          className="input font-mono text-sm"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Preview
        </p>
        <p>{preview}</p>
      </div>

      <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
        <div>
          {segments.units} characters · {segments.parts} SMS ·{' '}
          {Math.max(segments.remaining, 0)} remaining ·{' '}
          {segments.type === 'unicode' ? 'Unicode' : 'Text'}
        </div>
        <div className="sm:text-right">
          Estimated SENDPK usage: {segments.parts} SMS credit{segments.parts === 1 ? '' : 's'} per
          recipient
        </div>
      </div>
      {segments.parts > 1 && (
        <div
          className={`rounded-lg px-3 py-2 text-xs ${
            segments.parts >= 3 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'
          }`}
        >
          This message will be billed as {segments.parts} SMS messages for each recipient.
        </div>
      )}
      <p className="text-xs text-slate-400">
        Actual SMS usage may vary depending on patient name, booking ID, and other variable
        lengths.
      </p>

      <details className="rounded-lg border border-slate-200 p-3 text-xs">
        <summary className="cursor-pointer select-none font-medium text-slate-600">
          Advanced: SENDPK approval preview
        </summary>
        <div className="mt-2 space-y-2">
          <div>
            <p className="mb-1 font-medium text-slate-500">Local:</p>
            <p className="font-mono">{body}</p>
          </div>
          <div>
            <p className="mb-1 font-medium text-slate-500">SENDPK format:</p>
            <p className="font-mono">{sendpkPreview}</p>
          </div>
          <button type="button" className="btn-secondary text-xs" onClick={copySendPkWording}>
            Copy SENDPK Template
          </button>
          <p className="text-slate-400">
            Paste this exact wording into your SENDPK dashboard for approval, then sync templates
            here once it's approved.
          </p>
        </div>
      </details>

      <div>
        <label className="label">SENDPK Template</label>
        <select
          className="input"
          value={sendpkTemplateId}
          onChange={(e) => setSendpkTemplateId(e.target.value)}
        >
          <option value="">— Not mapped —</option>
          {mappedOption == null && event.sendpkTemplateId && (
            <option value={event.sendpkTemplateId}>
              {event.sendpkTemplateName ?? event.sendpkTemplateId} (last synced)
            </option>
          )}
          {templateOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.id})
            </option>
          ))}
        </select>
        {mappedOption && (
          <div className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
            <p>
              <span className="font-medium">Approved wording:</span> {mappedOption.message}
            </p>
            <p className="mt-1">
              <span className="font-medium">Required variables:</span>{' '}
              {requiredVars.length ? requiredVars.join(', ') : 'none'}
            </p>
          </div>
        )}
        {event.sendpkLastSyncedAt && (
          <p className="mt-1 text-xs text-slate-400">
            Last synced: {new Date(event.sendpkLastSyncedAt).toLocaleString()}
          </p>
        )}
      </div>

      {saveError && <div className="text-xs text-red-600">{saveError}</div>}
      <button type="button" className="btn-primary" disabled={saving} onClick={handleSave}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

export function SmsSettingsTab() {
  const [settings, setSettings] = useState<SmsSettings | null>(null);
  const [templateOptions, setTemplateOptions] = useState<SendPkTemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');

  async function load() {
    setLoading(true);
    try {
      setSettings(await settingsApi.getSmsSettings());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncError('');
    try {
      const templates = await settingsApi.syncSendPkTemplates();
      setTemplateOptions(templates);
      // Refreshed snapshots (name/wording/required vars) live server-side —
      // reload so already-mapped events pick them up.
      setSettings(await settingsApi.getSmsSettings());
    } catch (err: unknown) {
      setSyncError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Failed to sync SENDPK templates',
      );
    } finally {
      setSyncing(false);
    }
  }

  if (loading || !settings) {
    return <div className="card text-sm text-slate-500">Loading SMS settings…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">SMS Provider: SENDPK</h2>
            <p className="text-xs text-slate-500">
              {settings.provider.configured
                ? `Configured · Sender: ${settings.provider.sender}`
                : 'Not configured — set SENDPK_API_KEY and SENDPK_SENDER on the server'}
              {settings.provider.balance != null && ` · Balance: ${settings.provider.balance}`}
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            disabled={syncing || !settings.provider.configured}
            onClick={handleSync}
          >
            {syncing ? 'Syncing…' : 'Sync SENDPK Templates'}
          </button>
        </div>
        {syncError && <div className="text-xs text-red-600">{syncError}</div>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {settings.events.map((event) => (
          <EventCard
            key={event.key}
            event={event}
            templateOptions={templateOptions}
            onSaved={(updated) =>
              setSettings((prev) =>
                prev
                  ? {
                      ...prev,
                      events: prev.events.map((e) => (e.key === updated.key ? updated : e)),
                    }
                  : prev,
              )
            }
          />
        ))}
      </div>
    </div>
  );
}
