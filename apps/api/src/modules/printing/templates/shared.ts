export interface PrintSettings {
  labName: string;
  labNumber?: string;
  address?: string;
  phone?: string;
  email?: string;
  footerText?: string;
  printMode: 'PLAIN' | 'LETTERHEAD';
  marginTopMm: number;
  marginBottomMm: number;
  reportPagination: 'CONTINUOUS' | 'ONE_TEST_PER_PAGE';
  logoDataUrl?: string | null;
}

function esc(v: unknown): string {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function money(n: unknown): string {
  return `Rs ${Number(n ?? 0).toLocaleString('en-PK')}`;
}

/**
 * Base stylesheet shared by every printable document. Page-level @page
 * margins are set separately per-request via Puppeteer's own margin
 * option (from admin settings), not in this CSS, since Puppeteer's PDF
 * margins are a generation-time parameter, not a CSS rule.
 */
const BASE_CSS = `
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
    font-size: 10.5pt;
    color: #1e293b;
    margin: 0;
  }
  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #1e293b;
    padding-bottom: 10px;
    margin-bottom: 12px;
  }
  .doc-logo { height: 46px; margin-right: 10px; }
  .doc-lab-name { font-size: 15pt; font-weight: 700; margin: 0; }
  .doc-meta { font-size: 8.5pt; color: #475569; margin: 1px 0; }
  .doc-title {
    text-align: center;
    font-size: 12pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin: 6px 0 14px 0;
  }
  .doc-label { font-size: 7.5pt; text-transform: uppercase; color: #64748b; letter-spacing: 0.03em; }
  .doc-grid { display: grid; gap: 12px; margin-bottom: 14px; font-size: 9.5pt; }
  table.doc-table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 10px; }
  table.doc-table th, table.doc-table td { padding: 5px 7px; border-bottom: 1px solid #e2e8f0; text-align: left; }
  table.doc-table th { font-size: 7.5pt; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #1e293b; }
  .doc-badge { display: inline-block; border-radius: 4px; padding: 1px 8px; font-size: 8pt; background: #f1f5f9; }
  .doc-footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 7.5pt; color: #64748b; text-align: center; }
  .doc-critical { color: #b91c1c; font-weight: 700; }
  .doc-page-break { break-after: page; page-break-after: always; }
  .doc-page-break:last-of-type { break-after: auto; page-break-after: auto; }
  .doc-section { font-weight: 600; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; margin: 10px 0 6px 0; }
`;

/** Header block — omits lab logo/name/address/contact entirely in
 * Letterhead mode, since that's already printed on the physical paper. */
export function buildDocHeader(
  settings: PrintSettings,
  rightBlockHtml: string,
): string {
  const letterhead = settings.printMode === 'LETTERHEAD';
  const brandingHtml = letterhead
    ? '<div></div>'
    : `
      <div style="display:flex; gap:10px; align-items:flex-start;">
        ${settings.logoDataUrl ? `<img class="doc-logo" src="${settings.logoDataUrl}" />` : ''}
        <div>
          <p class="doc-lab-name">${esc(settings.labName)}</p>
          ${settings.labNumber ? `<p class="doc-meta">Lab / Reg. No: ${esc(settings.labNumber)}</p>` : ''}
          ${settings.address ? `<p class="doc-meta">${esc(settings.address)}</p>` : ''}
          <p class="doc-meta">${[settings.phone, settings.email].filter(Boolean).map(esc).join('  ·  ')}</p>
        </div>
      </div>
    `;
  return `<header class="doc-header">${brandingHtml}<div style="text-align:right;">${rightBlockHtml}</div></header>`;
}

/**
 * Single shared branding placeholder — every printable document gets this
 * via buildDocFooter below, rather than each template hardcoding its own
 * copy. Swap this one constant later when the real product/vendor name is
 * decided; nothing else needs to change. (Natural next step: promote this
 * into the Settings/Configuration store alongside printMode/margins/etc.,
 * once a real name replaces the placeholder — deliberately not done yet
 * since "LabFlow Systems" is explicitly a placeholder, not a setting an
 * admin should be able to type over today.)
 */
export const PRINT_BRANDING_NAME = 'LabFlow Systems';

export function buildDocFooter(settings: PrintSettings, extraHtml = ''): string {
  const letterhead = settings.printMode === 'LETTERHEAD';
  const boilerplate = letterhead ? '' : esc(settings.footerText || 'Computer-generated document.');
  const branding = `<div style="margin-top:4px; opacity:0.7;">Powered by ${esc(PRINT_BRANDING_NAME)}</div>`;
  return `<footer class="doc-footer">${boilerplate}${extraHtml}${branding}</footer>`;
}

/** Wraps a document body into a complete standalone HTML page ready for
 * Puppeteer to render — no external stylesheet loading, no client JS, no
 * navigation, nothing for a browser's print dialog to attach chrome to. */
export function wrapHtmlDocument(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>${BASE_CSS}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

export { esc };
