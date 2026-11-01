import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { type Browser, chromium } from 'playwright-core';
import { ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';

/** Where Chromium lives in development; the production image sets CHROMIUM_PATH. */
const DEFAULT_CHROMIUM = '/opt/pw-browsers/chromium';

export interface PdfOptions {
  /** Small grey text at the foot of every page, beside the page number. */
  readonly footer: string;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/**
 * HTML → A4 PDF through one shared headless Chromium (started on first use, restarted
 * if it goes away). Each render gets its own page, closed afterwards.
 */
@Injectable()
export class PdfRendererService implements OnModuleDestroy {
  private readonly logger = new Logger('PdfRenderer');
  private browser: Promise<Browser> | null = null;

  constructor(@Inject(ENVIRONMENT) private readonly env: Environment) {}

  private launch(): Promise<Browser> {
    if (!this.browser) {
      const executablePath = this.env.CHROMIUM_PATH ?? DEFAULT_CHROMIUM;
      this.browser = chromium
        .launch({
          executablePath,
          headless: true,
          args: ['--no-sandbox', '--disable-dev-shm-usage'],
        })
        .then((browser) => {
          browser.on('disconnected', () => {
            this.browser = null;
          });
          return browser;
        })
        .catch((error: unknown) => {
          this.browser = null;
          this.logger.error(`Could not start Chromium at ${executablePath}`);
          throw error;
        });
    }
    return this.browser;
  }

  async render(html: string, options: PdfOptions): Promise<Buffer> {
    const browser = await this.launch();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load' });
      // Wait until the embedded fonts are decoded so nothing prints in a fallback face.
      await page.evaluate('document.fonts.ready.then(() => true)');
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '12mm', right: '13mm', bottom: '15mm', left: '13mm' },
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: `<div style="width:100%;padding:0 13mm;font-family:sans-serif;font-size:7px;color:#8a8f96;display:flex;justify-content:space-between"><span>${escapeHtml(options.footer)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  async onModuleDestroy(): Promise<void> {
    const browser = await this.browser?.catch(() => null);
    await browser?.close();
  }
}
