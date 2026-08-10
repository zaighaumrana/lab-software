import { Injectable, OnModuleDestroy } from '@nestjs/common';
import puppeteer, { Browser } from 'puppeteer';

/**
 * Centralized printing engine: every printable document in the app should
 * go through this service rather than relying on the browser's own
 * window.print(). A real headless Chromium renders the HTML and produces
 * an actual PDF file — there is no print dialog involved at all, so there
 * is no "Headers and footers" browser setting to leak a URL/date/title
 * into the output. This is the definitive fix; PrintFrame (client-side
 * @page margins) was a best-effort mitigation for anyone still using
 * window.print() directly, not a substitute for this.
 *
 * The browser instance is kept warm across requests (launching Chromium
 * per-request is slow) and only torn down on app shutdown.
 */
@Injectable()
export class PrintingService implements OnModuleDestroy {
  private browserPromise: Promise<Browser> | null = null;

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browserPromise;
  }

  async renderPdf(
    html: string,
    options: { marginTopMm: number; marginBottomMm: number; marginSideMm?: number },
  ): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const sideMm = options.marginSideMm ?? 12;
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: `${options.marginTopMm}mm`,
          bottom: `${options.marginBottomMm}mm`,
          left: `${sideMm}mm`,
          right: `${sideMm}mm`,
        },
        // Explicitly empty — this is what actually removes the browser's
        // default page title/URL that a normal print dialog would add.
        displayHeaderFooter: false,
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  async onModuleDestroy() {
    if (this.browserPromise) {
      const browser = await this.browserPromise;
      await browser.close();
    }
  }
}
