import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOTS_DIR = path.resolve(process.env.SCREENSHOTS_DIR || './data/screenshots');

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private headless = true;

  async init(headless = true): Promise<void> {
    this.headless = headless;
    this.browser = await chromium.launch({
      headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });
  }

  async login(storeId: number, storageState?: string | null): Promise<boolean> {
    if (!this.browser) throw new Error('Browser not initialized');

    this.context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'zh-CN',
    });

    // Restore storage state if available
    if (storageState) {
      try {
        const state = JSON.parse(storageState);
        await this.context.addCookies(state.cookies || []);
        // Also restore localStorage if available
        if (state.origins && state.origins.length > 0) {
          // origins-based storage state
        }
      } catch {
        // Invalid storage state, will need fresh login
      }
    }

    this.page = await this.context.newPage();

    // Navigate to PDD merchant backend
    await this.page.goto('https://mms.pinduoduo.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Check if already logged in (look for login page indicators)
    const isLoginPage = await this.page.$('input[placeholder*="手机"], .login-form, [class*="login"]');

    if (isLoginPage) {
      console.log(`Store ${storeId}: Login required — please scan QR code or enter credentials`);
      await this.takeScreenshot(storeId, 'login-required');

      if (this.headless || !this.browser.isConnected()) return false;
      try {
        await this.page.waitForURL(
          (url) => !url.toString().includes('login') && !url.toString().includes('passport'),
          { timeout: 180000 },
        );
        await this.page.waitForTimeout(3000);
        const stillLoginPage = await this.page.$('input[placeholder*="手机"], .login-form, [class*="login"]');
        if (!stillLoginPage) {
          console.log(`Store ${storeId}: Manual login completed`);
          return true;
        }
      } catch {
        // Manual login timed out.
      }

      return false; // Needs manual login
    }

    console.log(`Store ${storeId}: Already logged in (cookie valid)`);
    return true;
  }

  async saveStorageState(): Promise<string> {
    if (!this.context) throw new Error('No browser context');
    const state = await this.context.storageState();
    return JSON.stringify(state);
  }

  getPage(): Page {
    if (!this.page) throw new Error('Page not initialized');
    return this.page;
  }

  async takeScreenshot(storeId: number, name: string): Promise<string> {
    if (!this.page) throw new Error('Page not initialized');

    const dir = path.join(SCREENSHOTS_DIR, String(storeId));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filename = `${name}-${Date.now()}.png`;
    const filepath = path.join(dir, filename);
    await this.page.screenshot({ path: filepath, fullPage: true });
    return filepath;
  }

  async navigateWithRetry(url: string, retries = 3): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    for (let i = 0; i < retries; i++) {
      try {
        await this.page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });
        // Random delay to simulate human
        await this.page.waitForTimeout(500 + Math.random() * 1500);
        return;
      } catch {
        if (i === retries - 1) throw new Error(`Failed to navigate to ${url} after ${retries} attempts`);
        await this.page.waitForTimeout(2000);
      }
    }
  }

  async waitForSelectorSafe(selector: string, timeout = 10000): Promise<boolean> {
    if (!this.page) throw new Error('Page not initialized');
    try {
      await this.page.waitForSelector(selector, { timeout });
      return true;
    } catch {
      return false;
    }
  }

  async extractText(selector: string): Promise<string | null> {
    if (!this.page) throw new Error('Page not initialized');
    try {
      const el = await this.page.$(selector);
      if (!el) return null;
      return (await el.textContent())?.trim() || null;
    } catch {
      return null;
    }
  }

  async close(): Promise<void> {
    if (this.page) await this.page.close();
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
    this.page = null;
    this.context = null;
    this.browser = null;
  }
}
