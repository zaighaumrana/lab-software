import { useSettings } from '../contexts/SettingsContext';

/** Shared header for invoice receipt and lab report prints */
export function PrintHeader({ subtitle }: { subtitle: string }) {
  const { branding, printLayout } = useSettings();
  const name = printLayout.labName || branding.labName;

  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-800 pb-4">
      <div className="flex items-start gap-3">
        {branding.logoDataUrl && (
          <img
            src={branding.logoDataUrl}
            alt="Lab logo"
            className="h-16 w-16 object-contain"
          />
        )}
        <div>
          <div className="text-xl font-bold text-slate-900">{name}</div>
          {printLayout.labNumber && (
            <div className="text-sm text-slate-600">Reg. / Lab #: {printLayout.labNumber}</div>
          )}
          {printLayout.address && (
            <div className="text-sm text-slate-600">{printLayout.address}</div>
          )}
          <div className="text-sm text-slate-600">
            {[printLayout.phone, printLayout.email].filter(Boolean).join(' · ')}
          </div>
          <div className="mt-1 text-xs font-medium text-slate-500">{subtitle}</div>
        </div>
      </div>
    </div>
  );
}

export function PrintFooter() {
  const { printLayout } = useSettings();
  return (
    <p className="mt-6 text-center text-xs text-slate-400">
      {printLayout.footerText ||
        'This document is computer generated. Keep your tracking ID for reference.'}
    </p>
  );
}
