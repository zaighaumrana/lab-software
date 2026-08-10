import { api } from '../api/client';

/**
 * Fetches a server-rendered PDF (via the Puppeteer printing pipeline) and
 * opens it in a new browser tab using the browser's native PDF viewer.
 *
 * This replaces window.print() as the printing path for every document
 * that has a backend PDF route. The browser's native PDF viewer print
 * button prints exactly the PDF bytes — there's no "page" for a browser
 * print dialog to attach a URL/date/title header to, because there's no
 * HTML page involved at print time at all, only a PDF file.
 *
 * Auth is handled the same way as every other API call (the shared axios
 * instance attaches the session token) — a plain <a href> or window.open()
 * pointed at the API URL directly would not include that header, which is
 * why this fetches as a blob first rather than just navigating there.
 */
export async function openPdf(path: string): Promise<void> {
  const response = await api.get(path, { responseType: 'blob' });
  const blob = new Blob([response.data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  // Revoke well after the new tab has had time to load the blob URL.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
