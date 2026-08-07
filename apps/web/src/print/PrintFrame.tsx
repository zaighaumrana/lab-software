import { ReactNode } from 'react';
import { useSettings } from '../contexts/SettingsContext';

/**
 * Centralized print engine entry point.
 *
 * Every printable document in the app (invoices, lab reports, and any
 * future printable — doctor share statements, receipts, certificates,
 * labels, etc.) should wrap its printable content in <PrintFrame>.
 *
 * It owns the one thing that can't be expressed as static CSS: page
 * margins are admin-configurable (mm values stored in settings), so the
 * @page rule has to be generated at render time rather than hardcoded in
 * print-document.css.
 *
 * What this does NOT (and cannot) do: suppress the browser's own
 * print-dialog "headers and footers" option (page title/URL/date), since
 * that's a per-browser, user-controlled setting outside what CSS/JS on the
 * page can touch. Setting @page margins here stops OUR content from
 * fighting that browser chrome for space, but if a client sees a URL/date
 * strip on a printed page, that's their browser's print dialog, not this
 * page's CSS — see README "Printing" section for how to turn it off, or
 * ask for the server-rendered PDF pipeline (Puppeteer) as the definitive
 * fix that bypasses window.print() entirely.
 */
export function PrintFrame({
  children,
  sideMarginMm = 12,
}: {
  children: ReactNode;
  sideMarginMm?: number;
}) {
  const { printLayout } = useSettings();
  const top = printLayout.marginTopMm ?? 14;
  const bottom = printLayout.marginBottomMm ?? 14;

  return (
    <>
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: ${top}mm ${sideMarginMm}mm ${bottom}mm ${sideMarginMm}mm;
          }
        }
      `}</style>
      {children}
    </>
  );
}

/** True when the admin has selected pre-printed letterhead paper — callers
 * should skip rendering lab logo/name/address/footer branding blocks. */
export function useIsLetterhead() {
  const { printLayout } = useSettings();
  return printLayout.printMode === 'LETTERHEAD';
}

/** True when reports should print one test per page rather than flowing
 * continuously — read from admin settings, not hardcoded. */
export function useReportPagination() {
  const { printLayout } = useSettings();
  return printLayout.reportPagination ?? 'CONTINUOUS';
}
