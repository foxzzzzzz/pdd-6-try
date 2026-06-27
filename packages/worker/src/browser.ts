import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { getBrowserChannel, getBrowserEnvironmentStatus } from '@pdd-inspector/core';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOTS_DIR = path.resolve(process.env.SCREENSHOTS_DIR || './data/screenshots');
const DEFAULT_VIEWPORT = { width: 1920, height: 1080 };
const DEFAULT_PROFILE_ROOT = './data/browser-profiles';
const DEFAULT_PROFILE_LOCK_STALE_MS = 2 * 60 * 60 * 1000;
const HUMAN_CLICK_BEFORE_MS: [number, number] = [500, 1500];
const HUMAN_CLICK_AFTER_MS: [number, number] = [800, 2000];
const HUMAN_FILL_BEFORE_MS: [number, number] = [500, 1200];
const HUMAN_FILL_AFTER_MS: [number, number] = [600, 1500];

export interface BrowserInitOptions {
  headless?: boolean;
  channel?: string | null;
  profileKey?: string | null;
  profileRootDir?: string;
  lockStaleMs?: number;
  viewport?: { width: number; height: number };
}

export interface BrowserRuntimeOptions {
  headless: boolean;
  channel: string | null;
  profileKey: string | null;
  profileRootDir: string;
  lockStaleMs: number;
  viewport: { width: number; height: number };
  args: string[];
  contextOptions: {
    viewport: { width: number; height: number };
    locale: string;
  };
}

interface ProfileLock {
  filePath: string;
  fd: number;
}

const LOGIN_PAGE_TEXT_MARKERS = [
  '\u626b\u7801\u767b\u5f55',
  '\u8d26\u53f7\u767b\u5f55',
  '\u6253\u5f00\u62fc\u591a\u591a\u5546\u5bb6\u7248App\u626b\u7801\u767b\u5f55',
];
const AUTHENTICATED_PAGE_TEXT_MARKERS = [
  '\u5546\u5bb6\u540e\u53f0',
  '\u53ef\u7533\u8bc9\u8ba2\u5355',
  '\u672a\u8bfb\u7ad9\u5185\u4fe1',
  '\u670d\u52a1\u6570\u636e',
  '\u8bc4\u4ef7\u7ba1\u7406',
];

export function parseStoredStorageState(storageState?: string | null): Record<string, unknown> | undefined {
  if (!storageState) return undefined;
  try {
    const parsed = JSON.parse(storageState);
    if (!parsed || typeof parsed !== 'object') return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function buildBrowserRuntimeOptions(options: BrowserInitOptions = {}): BrowserRuntimeOptions {
  const viewport = options.viewport || DEFAULT_VIEWPORT;
  const channel = options.channel ?? getBrowserChannel();
  return {
    headless: options.headless ?? false,
    channel: channel && channel !== 'chromium' ? channel : null,
    profileKey: options.profileKey?.trim() || null,
    profileRootDir: options.profileRootDir || process.env.BROWSER_PROFILE_ROOT || DEFAULT_PROFILE_ROOT,
    lockStaleMs: options.lockStaleMs || parsePositiveNumber(process.env.BROWSER_PROFILE_LOCK_STALE_MS, DEFAULT_PROFILE_LOCK_STALE_MS),
    viewport,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      `--window-size=${viewport.width},${viewport.height}`,
    ],
    contextOptions: {
      viewport,
      locale: 'zh-CN',
    },
  };
}

export function resolveProfileDirectory(profileKey: string, rootDir = process.env.BROWSER_PROFILE_ROOT || DEFAULT_PROFILE_ROOT): string {
  const safeKey = profileKey.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.resolve(rootDir, safeKey || 'unknown');
}

export function resolveHumanDelayMs(range: [number, number], randomValue = Math.random()): number {
  const min = Math.max(0, Math.floor(range[0]));
  const max = Math.max(min, Math.floor(range[1]));
  const boundedRandom = Math.max(0, Math.min(1, randomValue));
  return Math.round(min + (max - min) * boundedRandom);
}

export function isPddLoginUrl(url: string): boolean {
  return url.includes('login') || url.includes('passport');
}

export function inferPddPageLoginState(
  url: string,
  bodyText: string,
  hasLoginForm: boolean,
): 'login' | 'authenticated' | 'unknown' {
  if (AUTHENTICATED_PAGE_TEXT_MARKERS.some((marker) => bodyText.includes(marker))) return 'authenticated';
  if (hasLoginForm || isPddLoginUrl(url) || LOGIN_PAGE_TEXT_MARKERS.some((marker) => bodyText.includes(marker))) return 'login';
  return 'unknown';
}

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private profileLock: ProfileLock | null = null;
  private runtimeOptions: BrowserRuntimeOptions = buildBrowserRuntimeOptions();

  async init(options: boolean | BrowserInitOptions = {}): Promise<void> {
    const normalized = typeof options === 'boolean' ? { headless: options } : options;
    this.runtimeOptions = buildBrowserRuntimeOptions(normalized);
  }

  async login(storeId: number, storageState?: string | null): Promise<boolean> {
    await this.openContext(storageState);

    await this.page!.goto('https://mms.pinduoduo.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    const robustLoginState = await this.isLoginPage();

    if (robustLoginState) {
      console.log(`Store ${storeId}: Login required, please scan QR code or enter credentials`);
      await this.takeScreenshot(storeId, 'login-required');

      if (this.runtimeOptions.headless) return false;
      if (await this.waitForAuthenticatedPage(180000)) {
        console.log(`Store ${storeId}: Manual login completed`);
        return true;
      }
      try {
        await this.page!.waitForURL(
          (url) => !url.toString().includes('login') && !url.toString().includes('passport'),
          { timeout: 180000 },
        );
        await this.page!.waitForTimeout(3000);
        const stillLoginPage = await this.page!.$('input[placeholder*="手机"], .login-form, [class*="login"]');
        if (!stillLoginPage) {
          console.log(`Store ${storeId}: Manual login completed`);
          return true;
        }
      } catch {
        // Manual login timed out.
      }

      return false;
    }

    console.log(`Store ${storeId}: Already logged in (storage state valid)`);
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

  async savePageHtml(storeId: number, name: string): Promise<string> {
    if (!this.page) throw new Error('Page not initialized');

    const dir = path.join(SCREENSHOTS_DIR, String(storeId));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filename = `${name}-${Date.now()}.html`;
    const filepath = path.join(dir, filename);
    fs.writeFileSync(filepath, await this.page.content(), 'utf8');
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

  async humanPause(range: [number, number] = HUMAN_CLICK_AFTER_MS): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.waitForTimeout(resolveHumanDelayMs(range));
  }

  async humanClick(target: any, options: Record<string, unknown> = {}): Promise<void> {
    await this.humanPause(HUMAN_CLICK_BEFORE_MS);
    await target.scrollIntoViewIfNeeded?.().catch(() => undefined);
    await target.click({ timeout: 5000, ...options });
    await this.humanPause(HUMAN_CLICK_AFTER_MS);
  }

  async humanFill(target: any, value: string, options: Record<string, unknown> = {}): Promise<void> {
    await this.humanPause(HUMAN_FILL_BEFORE_MS);
    await target.fill(value, options);
    await this.humanPause(HUMAN_FILL_AFTER_MS);
  }

  async close(): Promise<void> {
    if (this.page) await this.page.close().catch(() => undefined);
    if (this.context) await this.context.close().catch(() => undefined);
    if (this.browser) await this.browser.close().catch(() => undefined);
    this.releaseProfileLock();
    this.page = null;
    this.context = null;
    this.browser = null;
  }

  private async openContext(storageState?: string | null): Promise<void> {
    const options = this.runtimeOptions;
    const browserStatus = getBrowserEnvironmentStatus();
    if (!browserStatus.ok) {
      throw new Error(browserStatus.message);
    }
    const launchOptions = {
      headless: options.headless,
      args: options.args,
      ...(options.channel ? { channel: options.channel } : {}),
    };
    const contextOptions = {
      ...options.contextOptions,
      storageState: parseStoredStorageState(storageState) as any,
    };

    if (options.profileKey) {
      const profileDir = resolveProfileDirectory(options.profileKey, options.profileRootDir);
      this.profileLock = acquireProfileLock(profileDir, options.lockStaleMs);
      try {
        this.context = await chromium.launchPersistentContext(profileDir, {
          ...launchOptions,
          ...contextOptions,
        });
        this.page = this.context.pages()[0] || await this.context.newPage();
        return;
      } catch (err) {
        this.releaseProfileLock();
        throw err;
      }
    }

    this.browser = await chromium.launch(launchOptions);
    this.context = await this.browser.newContext(contextOptions);
    this.page = await this.context.newPage();
  }

  private async isLoginPage(): Promise<boolean> {
    if (!this.page) throw new Error('Page not initialized');
    const hasLoginForm = Boolean(await this.page.$([
      'input[type="password"]',
      'input[placeholder*="\u624b\u673a"]',
      'input[placeholder*="\u8d26\u53f7"]',
      '.login-form',
      '[class*="login-form"]',
    ].join(', ')));
    const bodyText = await this.page.evaluate(() => document.body.innerText || '').catch(() => '');
    return inferPddPageLoginState(this.page.url(), bodyText, hasLoginForm) === 'login';
  }

  private async waitForAuthenticatedPage(timeoutMs: number): Promise<boolean> {
    if (!this.page) throw new Error('Page not initialized');
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await this.page.waitForTimeout(1000);
      const hasLoginForm = Boolean(await this.page.$([
        'input[type="password"]',
        'input[placeholder*="\u624b\u673a"]',
        'input[placeholder*="\u8d26\u53f7"]',
        '.login-form',
        '[class*="login-form"]',
      ].join(', ')).catch(() => null));
      const bodyText = await this.page.evaluate(() => document.body.innerText || '').catch(() => '');
      const state = inferPddPageLoginState(this.page.url(), bodyText, hasLoginForm);
      if (state === 'authenticated') return true;
      if (state === 'unknown' && !isPddLoginUrl(this.page.url())) return true;
    }
    return false;
  }

  private releaseProfileLock(): void {
    if (!this.profileLock) return;
    try {
      fs.closeSync(this.profileLock.fd);
    } catch {
      // Ignore close errors during cleanup.
    }
    try {
      fs.unlinkSync(this.profileLock.filePath);
    } catch {
      // Ignore stale cleanup errors.
    }
    this.profileLock = null;
  }
}

function acquireProfileLock(profileDir: string, staleMs: number): ProfileLock {
  fs.mkdirSync(profileDir, { recursive: true });
  const filePath = path.join(profileDir, '.profile.lock');
  try {
    const fd = fs.openSync(filePath, 'wx');
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
    return { filePath, fd };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    const stat = fs.statSync(filePath);
    if (Date.now() - stat.mtimeMs > staleMs) {
      fs.unlinkSync(filePath);
      return acquireProfileLock(profileDir, staleMs);
    }
    throw new Error(`Browser profile is already in use: ${profileDir}`);
  }
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
