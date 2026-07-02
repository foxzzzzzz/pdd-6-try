import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { getBrowserChannel, getBrowserEnvironmentStatus } from '@pdd-inspector/core';
import { ChildProcess, execFileSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import * as zlib from 'zlib';

const SCREENSHOTS_DIR = path.resolve(process.env.SCREENSHOTS_DIR || './data/screenshots');
const DEFAULT_PROFILE_ROOT = './data/browser-profiles';
const DEFAULT_PROFILE_LOCK_STALE_MS = 2 * 60 * 60 * 1000;
const HUMAN_CLICK_BEFORE_MS: [number, number] = [500, 1500];
const HUMAN_CLICK_AFTER_MS: [number, number] = [800, 2000];
const HUMAN_FILL_BEFORE_MS: [number, number] = [500, 1200];
const HUMAN_FILL_AFTER_MS: [number, number] = [600, 1500];
const DEFAULT_READ_NAV_BEFORE_MS: [number, number] = [1000, 2500];
const DEFAULT_READ_NAV_AFTER_MS: [number, number] = [2500, 5500];
const DEFAULT_READ_MODULE_GAP_MS: [number, number] = [1500, 4000];
const DEFAULT_READ_FIRST_PAGE_DELAY_MS: [number, number] = [3000, 6000];
const CHROME_ACCEPT_LANGUAGES = 'zh-CN,zh';
const HTTP_ACCEPT_LANGUAGE = 'zh-CN,zh;q=0.9';
const DEFAULT_EXTERNAL_CDP_PORT = 9222;
const REDUCED_PLAYWRIGHT_DEFAULT_ARGS = [
  '--no-sandbox',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-extensions',
  '--disable-sync',
  '--password-store=basic',
  '--use-mock-keychain',
];

export interface BrowserInitOptions {
  headless?: boolean;
  channel?: string | null;
  profileKey?: string | null;
  profileRootDir?: string;
  lockStaleMs?: number;
  viewport?: { width: number; height: number } | null;
}

export interface BrowserRuntimeOptions {
  headless: boolean;
  channel: string | null;
  launchMode: 'playwright' | 'external-cdp';
  cdpPort: number;
  profileKey: string | null;
  profileRootDir: string;
  lockStaleMs: number;
  viewport: { width: number; height: number } | null;
  args: string[];
  contextOptions: {
    viewport: { width: number; height: number } | null;
    extraHTTPHeaders: Record<string, string>;
  };
  ignoreDefaultArgs: string[];
  readPacing: ReadPacingOptions;
}

export interface ReadPacingOptions {
  navigationBeforeMs: [number, number];
  navigationAfterMs: [number, number];
  moduleGapMs: [number, number];
  firstPageDelayMs: [number, number];
}

interface ProfileLock {
  filePath: string;
  fd: number;
}

interface PixelSnapshot {
  width: number;
  height: number;
  data: Uint8Array;
}

interface SecurityDomSnapshot {
  url: string;
  bodyText: string;
  hasChallengeElement: boolean;
  hasChallengeOverlay: boolean;
  candidates: Array<Record<string, unknown>>;
}

interface SecurityChallengeDiagnostic {
  phase: string;
  url: string;
  signals: string[];
  screenshotPath?: string;
  htmlPath?: string;
  diagnosticPath?: string;
}

interface ChromeProcessInfo {
  pid: number;
  parentPid?: number;
  commandLine: string;
}

interface ChromeProcessDiagnostic extends ChromeProcessInfo {
  matchesProfile: boolean;
}

export class SecurityChallengeError extends Error {
  diagnostic: SecurityChallengeDiagnostic;

  constructor(message: string, diagnostic: SecurityChallengeDiagnostic) {
    super(message);
    this.name = 'SecurityChallengeError';
    this.diagnostic = diagnostic;
  }
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
const SECURITY_CHALLENGE_TEXT_MARKERS = [
  '\u8bf7\u5411\u53f3\u6ed1\u5757\u5b8c\u6210\u62fc\u56fe',
  '\u6ed1\u5757\u5b8c\u6210\u62fc\u56fe',
  '\u5b8c\u6210\u62fc\u56fe',
  '\u62d6\u52a8\u6ed1\u5757',
  '\u5b89\u5168\u9a8c\u8bc1',
  '\u9a8c\u8bc1\u7801',
  'captcha',
  'verify',
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
  const viewport = options.viewport ?? null;
  const channel = options.channel ?? getBrowserChannel();
  const launchMode = process.env.BROWSER_LAUNCH_MODE === 'external-cdp' ? 'external-cdp' : 'playwright';
  return {
    headless: options.headless ?? false,
    channel: channel && channel !== 'chromium' ? channel : null,
    launchMode,
    cdpPort: parsePositiveNumber(process.env.BROWSER_CDP_PORT, DEFAULT_EXTERNAL_CDP_PORT),
    profileKey: options.profileKey?.trim() || null,
    profileRootDir: options.profileRootDir || process.env.BROWSER_PROFILE_ROOT || DEFAULT_PROFILE_ROOT,
    lockStaleMs: options.lockStaleMs || parsePositiveNumber(process.env.BROWSER_PROFILE_LOCK_STALE_MS, DEFAULT_PROFILE_LOCK_STALE_MS),
    viewport,
    args: buildBrowserArgs(),
    contextOptions: {
      viewport,
      extraHTTPHeaders: {
        'Accept-Language': HTTP_ACCEPT_LANGUAGE,
      },
    },
    ignoreDefaultArgs: REDUCED_PLAYWRIGHT_DEFAULT_ARGS,
    readPacing: resolveReadPacingOptions(),
  };
}

function buildBrowserArgs(): string[] {
  const args: string[] = [];
  if (process.env.BROWSER_DISABLE_SANDBOX === 'true') {
    args.unshift('--no-sandbox', '--disable-setuid-sandbox');
  }
  return args;
}

function sampleLuma(
  data: Uint8Array,
  width: number,
  height: number,
  regions: Array<[number, number, number, number]>,
): number {
  let total = 0;
  let count = 0;
  for (const [x1Ratio, y1Ratio, x2Ratio, y2Ratio] of regions) {
    const stats = sampleStats(data, width, height, x1Ratio, y1Ratio, x2Ratio, y2Ratio);
    total += stats.avgLuma * stats.count;
    count += stats.count;
  }
  return count > 0 ? total / count : 0;
}

function sampleStats(
  data: Uint8Array,
  width: number,
  height: number,
  x1Ratio: number,
  y1Ratio: number,
  x2Ratio: number,
  y2Ratio: number,
): { avgLuma: number; whiteRatio: number; lightGrayRatio: number; count: number } {
  const x1 = Math.max(0, Math.floor(width * x1Ratio));
  const y1 = Math.max(0, Math.floor(height * y1Ratio));
  const x2 = Math.min(width, Math.ceil(width * x2Ratio));
  const y2 = Math.min(height, Math.ceil(height * y2Ratio));
  let lumaTotal = 0;
  let white = 0;
  let lightGray = 0;
  let count = 0;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 180));

  for (let y = y1; y < y2; y += step) {
    for (let x = x1; x < x2; x += step) {
      const offset = (y * width + x) * 4;
      const r = data[offset] || 0;
      const g = data[offset + 1] || 0;
      const b = data[offset + 2] || 0;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      lumaTotal += luma;
      if (luma >= 240 && max - min <= 18) white++;
      if (luma >= 210 && luma < 240 && max - min <= 20) lightGray++;
      count++;
    }
  }

  return {
    avgLuma: count > 0 ? lumaTotal / count : 0,
    whiteRatio: count > 0 ? white / count : 0,
    lightGrayRatio: count > 0 ? lightGray / count : 0,
    count,
  };
}

export function resolveProfileDirectory(profileKey: string, rootDir = process.env.BROWSER_PROFILE_ROOT || DEFAULT_PROFILE_ROOT): string {
  const safeKey = profileKey.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.resolve(rootDir, safeKey || 'unknown');
}

export function buildChromeProcessDiagnostics(processes: ChromeProcessInfo[], profileDirectory: string | null): ChromeProcessDiagnostic[] {
  const normalizedProfile = profileDirectory ? normalizeCommandLinePath(profileDirectory) : null;
  return processes.map((processInfo) => {
    const normalizedCommandLine = normalizeCommandLinePath(processInfo.commandLine);
    return {
      ...processInfo,
      matchesProfile: Boolean(normalizedProfile && normalizedCommandLine.includes(normalizedProfile)),
    };
  });
}

export function buildExternalChromeLaunchArgs(profileDir: string, cdpPort: number): string[] {
  return [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ];
}

export function resolveHumanDelayMs(range: [number, number], randomValue = Math.random()): number {
  const min = Math.max(0, Math.floor(range[0]));
  const max = Math.max(min, Math.floor(range[1]));
  const boundedRandom = Math.max(0, Math.min(1, randomValue));
  return Math.round(min + (max - min) * boundedRandom);
}

export function resolveReadPacingOptions(env: NodeJS.ProcessEnv = process.env): ReadPacingOptions {
  return {
    navigationBeforeMs: parseDelayRange(env.WORKER_READ_NAV_BEFORE_DELAY_MS, DEFAULT_READ_NAV_BEFORE_MS),
    navigationAfterMs: parseDelayRange(env.WORKER_READ_NAV_AFTER_DELAY_MS, DEFAULT_READ_NAV_AFTER_MS),
    moduleGapMs: parseDelayRange(env.WORKER_READ_MODULE_GAP_MS, DEFAULT_READ_MODULE_GAP_MS),
    firstPageDelayMs: parseDelayRange(env.WORKER_READ_FIRST_PAGE_DELAY_MS, DEFAULT_READ_FIRST_PAGE_DELAY_MS),
  };
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

export function inferPddSecurityChallenge(bodyText: string, hasChallengeElement = false, hasChallengeOverlay = false): boolean {
  const normalized = (bodyText || '').toLowerCase().replace(/\s+/g, '');
  return hasChallengeElement
    || hasChallengeOverlay
    || SECURITY_CHALLENGE_TEXT_MARKERS.some((marker) => normalized.includes(marker.toLowerCase().replace(/\s+/g, '')));
}

export function mergeChromeLanguagePreferences(preferences: Record<string, unknown>): Record<string, unknown> {
  const intl = preferences.intl && typeof preferences.intl === 'object' && !Array.isArray(preferences.intl)
    ? preferences.intl as Record<string, unknown>
    : {};
  const partition = preferences.partition && typeof preferences.partition === 'object' && !Array.isArray(preferences.partition)
    ? preferences.partition as Record<string, unknown>
    : {};
  const perHostZoomLevels = partition.per_host_zoom_levels
    && typeof partition.per_host_zoom_levels === 'object'
    && !Array.isArray(partition.per_host_zoom_levels)
    ? partition.per_host_zoom_levels as Record<string, unknown>
    : {};
  const cleanedPerHostZoomLevels = removePddHostZoomLevels(perHostZoomLevels);
  return {
    ...preferences,
    intl: {
      ...intl,
      accept_languages: CHROME_ACCEPT_LANGUAGES,
      selected_languages: CHROME_ACCEPT_LANGUAGES,
    },
    partition: {
      ...partition,
      per_host_zoom_levels: cleanedPerHostZoomLevels,
    },
  };
}

function removePddHostZoomLevels(perHostZoomLevels: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [scope, hosts] of Object.entries(perHostZoomLevels)) {
    if (!hosts || typeof hosts !== 'object' || Array.isArray(hosts)) {
      next[scope] = hosts;
      continue;
    }

    const nextHosts = { ...(hosts as Record<string, unknown>) };
    delete nextHosts['mms.pinduoduo.com'];
    next[scope] = nextHosts;
  }
  return next;
}

export function inferSecurityChallengeFromScreenshotPixels(snapshot: PixelSnapshot): boolean {
  const { width, height, data } = snapshot;
  if (width < 320 || height < 240 || data.length < width * height * 4) return false;

  const backdrop = sampleLuma(data, width, height, [
    [0, 0, 0.18, 0.18],
    [0.82, 0, 1, 0.18],
    [0, 0.82, 0.18, 1],
    [0.82, 0.82, 1, 1],
  ]);
  const center = sampleStats(data, width, height, 0.28, 0.20, 0.72, 0.78);
  const lowerCenter = sampleStats(data, width, height, 0.34, 0.50, 0.70, 0.72);

  const dimmedBackdrop = backdrop > 45 && backdrop < 210;
  const brightDialog = center.whiteRatio > 0.18 && center.avgLuma > backdrop + 25;
  const sliderLikeTrack = lowerCenter.lightGrayRatio > 0.08 || lowerCenter.whiteRatio > 0.16;
  return hasSliderChallengePanel(data, width, height, dimmedBackdrop) || (dimmedBackdrop && (
    (brightDialog && sliderLikeTrack)
    || hasOffCenterChallengePanel(data, width, height, backdrop)
  ));
}

function hasSliderChallengePanel(data: Uint8Array, width: number, height: number, dimmedBackdrop: boolean): boolean {
  const panelWidths = [0.10, 0.12, 0.14, 0.16, 0.20, 0.24, 0.28, 0.32, 0.36];
  const panelHeights = [0.18, 0.22, 0.26, 0.30, 0.35];
  const stepX = 0.025;
  const stepY = 0.03;

  for (const panelWidth of panelWidths) {
    for (const panelHeight of panelHeights) {
      for (let y = 0.08; y + panelHeight <= 0.92; y += stepY) {
        for (let x = 0.04; x + panelWidth <= 0.96; x += stepX) {
          const panel = sampleStats(data, width, height, x, y, x + panelWidth, y + panelHeight);
          if (panel.avgLuma < 165 || panel.whiteRatio < 0.10) continue;
          if (!dimmedBackdrop && panel.avgLuma < 242) continue;

          const image = sampleStats(data, width, height, x + panelWidth * 0.08, y + panelHeight * 0.10, x + panelWidth * 0.92, y + panelHeight * 0.55);
          const track = sampleStats(data, width, height, x + panelWidth * 0.14, y + panelHeight * 0.70, x + panelWidth * 0.92, y + panelHeight * 0.92);
          const handle = sampleStats(data, width, height, x + panelWidth * 0.04, y + panelHeight * 0.60, x + panelWidth * 0.30, y + panelHeight * 0.98);
          const hasImageBand = image.avgLuma > 55 && image.whiteRatio < 0.45;
          const hasSliderTrack = track.lightGrayRatio > 0.12;
          const hasSliderHandle = handle.whiteRatio > 0.18 && handle.avgLuma > 150;
          if (hasImageBand && hasSliderTrack && hasSliderHandle) return true;
        }
      }
    }
  }
  return false;
}

function hasOffCenterChallengePanel(data: Uint8Array, width: number, height: number, backdropLuma: number): boolean {
  const panelWidths = [0.20, 0.24, 0.28, 0.32, 0.36];
  const panelHeights = [0.20, 0.25, 0.30, 0.35];
  const stepX = 0.04;
  const stepY = 0.04;

  for (const panelWidth of panelWidths) {
    for (const panelHeight of panelHeights) {
      for (let y = 0.16; y + panelHeight <= 0.96; y += stepY) {
        for (let x = 0.08; x + panelWidth <= 0.96; x += stepX) {
          const panel = sampleStats(data, width, height, x, y, x + panelWidth, y + panelHeight);
          if (panel.avgLuma < backdropLuma + 28 || panel.whiteRatio < 0.12) continue;

          const image = sampleStats(data, width, height, x + panelWidth * 0.08, y + panelHeight * 0.10, x + panelWidth * 0.92, y + panelHeight * 0.52);
          const track = sampleStats(data, width, height, x + panelWidth * 0.10, y + panelHeight * 0.68, x + panelWidth * 0.92, y + panelHeight * 0.90);
          const handle = sampleStats(data, width, height, x + panelWidth * 0.04, y + panelHeight * 0.60, x + panelWidth * 0.26, y + panelHeight * 0.96);
          const hasImageBand = image.avgLuma > backdropLuma + 10 && image.whiteRatio < 0.45;
          const hasSliderTrack = track.lightGrayRatio > 0.12;
          const hasSliderHandle = handle.whiteRatio > 0.20 && handle.avgLuma > backdropLuma + 40;
          if (hasImageBand && hasSliderTrack && hasSliderHandle) return true;
        }
      }
    }
  }
  return false;
}

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private profileLock: ProfileLock | null = null;
  private externalChromeProcess: ChildProcess | null = null;
  private runtimeOptions: BrowserRuntimeOptions = buildBrowserRuntimeOptions();
  private currentStoreId: number | null = null;

  async init(options: boolean | BrowserInitOptions = {}): Promise<void> {
    const normalized = typeof options === 'boolean' ? { headless: options } : options;
    this.runtimeOptions = buildBrowserRuntimeOptions(normalized);
  }

  async login(storeId: number, storageState?: string | null): Promise<boolean> {
    this.currentStoreId = storeId;
    console.log(`Store ${storeId}: Opening PDD home for login state check`);
    await this.openContext(storageState);

    await this.page!.goto('https://mms.pinduoduo.com/home/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    console.log(`Store ${storeId}: PDD home loaded for login state check url=${this.page!.url()}`);

    await this.assertNoSecurityChallenge('login page', storeId);

    console.log(`Store ${storeId}: Login state check started`);
    const robustLoginState = await this.isLoginPage();
    console.log(`Store ${storeId}: Login state check result=${robustLoginState ? 'login_required' : 'authenticated_or_unknown'}`);

    if (robustLoginState) {
      await this.page!.waitForTimeout(1500);
      await this.assertNoSecurityChallenge('login page after login-required', storeId);
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

    await this.page!.waitForTimeout(1500);
    await this.assertNoSecurityChallenge('login page after authenticated', storeId);
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

  async hasSecurityChallenge(): Promise<boolean> {
    if (!this.page) throw new Error('Page not initialized');
    const snapshots = await this.collectSecurityChallengeDomSnapshots();
    return snapshots.some((snapshot) =>
      inferPddSecurityChallenge(snapshot.bodyText, snapshot.hasChallengeElement, snapshot.hasChallengeOverlay),
    );
  }

  async assertNoSecurityChallenge(phase: string, storeId = this.currentStoreId || 0): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    console.log(`Store ${storeId}: Security challenge check started: ${phase} url=${this.page.url()}`);
    const snapshots = await this.collectSecurityChallengeDomSnapshots();
    const signals: string[] = [];
    if (snapshots.some((snapshot) => inferPddSecurityChallenge(snapshot.bodyText, snapshot.hasChallengeElement, snapshot.hasChallengeOverlay))) {
      signals.push('dom-frame-shadow');
    }

    const dir = path.join(SCREENSHOTS_DIR, String(storeId));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const timestamp = Date.now();
    const safePhase = phase.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'security-challenge';
    const screenshotPath = path.join(dir, `security-challenge-${safePhase}-${timestamp}.png`);
    const screenshot = await this.page.screenshot({ path: screenshotPath, fullPage: false });
    const pixels = decodePngPixels(screenshot);
    if (pixels && inferSecurityChallengeFromScreenshotPixels(pixels)) signals.push('screenshot-modal-overlay');

    if (signals.length === 0) {
      try { fs.unlinkSync(screenshotPath); } catch { /* ignore cleanup */ }
      console.log(`Store ${storeId}: Security challenge check passed: ${phase}`);
      return;
    }

    const htmlPath = path.join(dir, `security-challenge-${safePhase}-${timestamp}.html`);
    const diagnosticPath = path.join(dir, `security-challenge-${safePhase}-${timestamp}.json`);
    const profileDirectory = this.runtimeOptions.profileKey
      ? resolveProfileDirectory(this.runtimeOptions.profileKey, this.runtimeOptions.profileRootDir)
      : null;
    fs.writeFileSync(htmlPath, await this.page.content(), 'utf8');
    fs.writeFileSync(diagnosticPath, JSON.stringify({
      detectedAt: new Date().toISOString(),
      phase,
      url: this.page.url(),
      signals,
      screenshotPath,
      htmlPath,
      runtimeOptions: this.runtimeOptions,
      profileDirectory,
      chromeProcesses: collectChromeProcessDiagnostics(profileDirectory),
      fingerprint: await this.collectPageFingerprint(),
      frames: snapshots,
    }, null, 2), 'utf8');
    console.log(`Store ${storeId}: Security challenge detected: ${phase} signals=${signals.join(',')} screenshot=${screenshotPath} diagnostic=${diagnosticPath}`);

    throw new SecurityChallengeError(`Security challenge detected during ${phase}; patrol paused for manual handling`, {
      phase,
      url: this.page.url(),
      signals,
      screenshotPath,
      htmlPath,
      diagnosticPath,
    });
  }

  private async collectSecurityChallengeDomSnapshots(): Promise<SecurityDomSnapshot[]> {
    if (!this.page) throw new Error('Page not initialized');
    const snapshots: SecurityDomSnapshot[] = [];
    for (const frame of this.page.frames()) {
      const snapshot = await frame.evaluate(() => {
        const isVisible = (element: Element): boolean => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== 'hidden'
            && style.display !== 'none'
            && rect.width > 0
            && rect.height > 0;
        };
        const queryAll = (selector: string): Element[] => {
          const results: Element[] = [];
          const visit = (root: Document | ShadowRoot): void => {
            root.querySelectorAll(selector).forEach((element) => {
              results.push(element);
              if (element.shadowRoot) visit(element.shadowRoot);
            });
          };
          visit(document);
          return results;
        };
        const challengeSelector = [
          '[class*="captcha" i]',
          '[id*="captcha" i]',
          '[class*="verify" i]',
          '[id*="verify" i]',
          '[class*="slider" i]',
          '[id*="slider" i]',
          '[class*="puzzle" i]',
          '[id*="puzzle" i]',
        ].join(', ');
        const hasChallengeElement = queryAll(challengeSelector).some((element) => {
          if (!isVisible(element)) return false;
          const identity = `${element.id || ''} ${element.className || ''}`.toLowerCase();
          const text = (element.textContent || '').toLowerCase().replace(/\s+/g, '');
          const hasVisualChallenge = Boolean(element.querySelector('canvas, img'));
          return hasVisualChallenge
            || text.includes('\u6ed1\u5757')
            || text.includes('\u62fc\u56fe')
            || text.includes('\u9a8c\u8bc1')
            || identity.includes('captcha')
            || identity.includes('slider')
            || identity.includes('puzzle');
        });
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const hasDimOverlay = queryAll('body *').some((element) => {
          if (!isVisible(element)) return false;
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          const zIndex = Number.parseInt(style.zIndex || '0', 10);
          const coversViewport = viewportWidth > 0
            && viewportHeight > 0
            && rect.width >= viewportWidth * 0.7
            && rect.height >= viewportHeight * 0.7;
          const background = style.backgroundColor || '';
          const hasDimBackground = /rgba\([^)]*,\s*0\.[1-9]/.test(background)
            || (Number.parseFloat(style.opacity || '1') < 1 && Number.parseFloat(style.opacity || '1') > 0);
          return coversViewport
            && (style.position === 'fixed' || style.position === 'absolute')
            && (hasDimBackground || zIndex >= 100);
        });
        const hasChallengeOverlay = hasDimOverlay && queryAll('body *').some((element) => {
          if (!isVisible(element)) return false;
          const rect = element.getBoundingClientRect();
          if (rect.width < 240 || rect.width > 700 || rect.height < 140 || rect.height > 520) return false;

          const media = Array.from(element.querySelectorAll('canvas, img')).some((child) => {
            if (!isVisible(child)) return false;
            const childRect = child.getBoundingClientRect();
            return childRect.width >= 120 && childRect.height >= 50;
          });
          if (!media) return false;

          const horizontalTrack = Array.from(element.querySelectorAll('*')).some((child) => {
            if (!isVisible(child)) return false;
            const childRect = child.getBoundingClientRect();
            return childRect.width >= 160
              && childRect.width <= rect.width
              && childRect.height >= 20
              && childRect.height <= 90;
          });
          return horizontalTrack;
        });
        return {
          url: window.location.href,
          bodyText: document.body.innerText || '',
          hasChallengeElement,
          hasChallengeOverlay,
          candidates: queryAll('body *').slice(0, 80).map((element) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return {
              tag: element.tagName,
              id: element.id || '',
              className: typeof element.className === 'string' ? element.className : '',
              text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 220),
              rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
              style: {
                position: style.position,
                zIndex: style.zIndex,
                display: style.display,
                visibility: style.visibility,
                opacity: style.opacity,
                backgroundColor: style.backgroundColor,
              },
              hasImg: Boolean(element.querySelector('img')),
              hasCanvas: Boolean(element.querySelector('canvas')),
            };
          }),
        };
      }).catch(() => ({
        url: frame.url(),
        bodyText: '',
        hasChallengeElement: false,
        hasChallengeOverlay: false,
        candidates: [],
      }));
      snapshots.push(snapshot);
    }
    return snapshots;
  }

  private async collectPageFingerprint(): Promise<Record<string, unknown>> {
    if (!this.page) throw new Error('Page not initialized');
    return await this.page.evaluate(() => ({
      href: window.location.href,
      webdriver: navigator.webdriver,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      languages: navigator.languages,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: {
        width: window.screen.width,
        height: window.screen.height,
        availWidth: window.screen.availWidth,
        availHeight: window.screen.availHeight,
        colorDepth: window.screen.colorDepth,
        pixelDepth: window.screen.pixelDepth,
      },
      window: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
    })).catch((err) => ({ error: err instanceof Error ? err.message : String(err) }));
  }

  async waitForSecurityChallengeCleared(timeoutMs: number): Promise<boolean> {
    if (!this.page) throw new Error('Page not initialized');
    const deadline = Date.now() + Math.max(0, timeoutMs);
    while (Date.now() < deadline) {
      if (!(await this.hasSecurityChallenge())) return true;
      await this.page.waitForTimeout(1000);
    }
    return !(await this.hasSecurityChallenge());
  }

  async navigateWithRetry(url: string, retries = 3): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    for (let i = 0; i < retries; i++) {
      try {
        await this.humanPause(this.runtimeOptions.readPacing.navigationBeforeMs);
        await this.page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });
        await this.humanPause(this.runtimeOptions.readPacing.navigationAfterMs);
        await this.assertNoSecurityChallenge(`navigation to ${url}`);
        return;
      } catch (err) {
        if (err instanceof Error && err.message.includes('Security challenge detected')) throw err;
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

  async pauseBeforeFirstReadPage(): Promise<void> {
    await this.humanPause(this.runtimeOptions.readPacing.firstPageDelayMs);
  }

  async pauseBetweenReadModules(): Promise<void> {
    await this.humanPause(this.runtimeOptions.readPacing.moduleGapMs);
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
    if (this.externalChromeProcess && !this.externalChromeProcess.killed) {
      this.externalChromeProcess.kill();
    }
    this.releaseProfileLock();
    this.page = null;
    this.context = null;
    this.browser = null;
    this.externalChromeProcess = null;
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
      ignoreDefaultArgs: options.ignoreDefaultArgs,
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
        ensureChromeLanguagePreferences(profileDir);
        if (options.launchMode === 'external-cdp') {
          if (!browserStatus.chromeExecutablePath) {
            throw new Error('External CDP launch requires a system Chrome executable');
          }
          this.externalChromeProcess = await launchExternalChromeForCdp(
            browserStatus.chromeExecutablePath,
            profileDir,
            options.cdpPort,
          );
          this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${options.cdpPort}`);
          this.context = this.browser.contexts()[0] || await this.browser.newContext(contextOptions);
          await this.context.setExtraHTTPHeaders(options.contextOptions.extraHTTPHeaders);
          this.page = this.context.pages()[0] || await this.context.newPage();
          return;
        }
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
    const lockContent = fs.readFileSync(filePath, 'utf8');
    if (!isProfileLockOwnerAlive(lockContent) || Date.now() - stat.mtimeMs > staleMs) {
      fs.unlinkSync(filePath);
      return acquireProfileLock(profileDir, staleMs);
    }
    throw new Error(`Browser profile is already in use: ${profileDir}`);
  }
}

export function isProfileLockOwnerAlive(lockContent: string, isPidRunning = isProcessRunning): boolean {
  try {
    const parsed = JSON.parse(lockContent);
    const pid = Number(parsed?.pid);
    return Number.isInteger(pid) && pid > 0 && isPidRunning(pid);
  } catch {
    return false;
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function launchExternalChromeForCdp(
  chromeExecutablePath: string,
  profileDir: string,
  cdpPort: number,
): Promise<ChildProcess> {
  const child = spawn(chromeExecutablePath, buildExternalChromeLaunchArgs(profileDir, cdpPort), {
    detached: false,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
  await waitForCdpEndpoint(cdpPort, 10000);
  return child;
}

async function waitForCdpEndpoint(cdpPort: number, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await canReachCdpEndpoint(cdpPort)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for external Chrome CDP endpoint on port ${cdpPort}`);
}

function canReachCdpEndpoint(cdpPort: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({
      host: '127.0.0.1',
      port: cdpPort,
      path: '/json/version',
      timeout: 1000,
    }, (res) => {
      res.resume();
      resolve(Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 500));
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

function collectChromeProcessDiagnostics(profileDirectory: string | null): Record<string, unknown> {
  if (process.platform !== 'win32') {
    return { platform: process.platform, processes: [] };
  }

  const script = [
    "Get-CimInstance Win32_Process -Filter \"Name = 'chrome.exe'\"",
    "Select-Object @{Name='pid';Expression={$_.ProcessId}}, @{Name='parentPid';Expression={$_.ParentProcessId}}, @{Name='commandLine';Expression={$_.CommandLine}}",
    'ConvertTo-Json -Compress',
  ].join(' | ');

  try {
    const output = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    }).trim();
    if (!output) return { platform: process.platform, processes: [] };

    const parsed = JSON.parse(output);
    const rawProcesses = Array.isArray(parsed) ? parsed : [parsed];
    const processes = rawProcesses
      .map((entry) => ({
        pid: Number(entry.pid),
        parentPid: Number(entry.parentPid),
        commandLine: String(entry.commandLine || ''),
      }))
      .filter((entry) => Number.isInteger(entry.pid) && entry.pid > 0 && entry.commandLine);

    return {
      platform: process.platform,
      processes: buildChromeProcessDiagnostics(processes, profileDirectory),
    };
  } catch (err) {
    return {
      platform: process.platform,
      error: err instanceof Error ? err.message : String(err),
      processes: [],
    };
  }
}

function normalizeCommandLinePath(value: string): string {
  return value.replace(/\//g, '\\').replace(/\\+/g, '\\').toLowerCase();
}

function ensureChromeLanguagePreferences(profileDir: string): void {
  const defaultProfileDir = path.join(profileDir, 'Default');
  const preferencesPath = path.join(defaultProfileDir, 'Preferences');
  fs.mkdirSync(defaultProfileDir, { recursive: true });

  let preferences: Record<string, unknown> = {};
  if (fs.existsSync(preferencesPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(preferencesPath, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        preferences = parsed as Record<string, unknown>;
      }
    } catch {
      console.warn(`Unable to parse Chrome Preferences for language alignment: ${preferencesPath}`);
      return;
    }
  }

  const nextPreferences = mergeChromeLanguagePreferences(preferences);
  if (JSON.stringify(nextPreferences) === JSON.stringify(preferences)) return;
  fs.writeFileSync(preferencesPath, JSON.stringify(nextPreferences), 'utf8');
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseDelayRange(value: string | undefined, fallback: [number, number]): [number, number] {
  if (!value) return fallback;
  const match = value.trim().match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) return fallback;
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) return fallback;
  return [Math.floor(min), Math.floor(max)];
}

function decodePngPixels(buffer: Buffer): PixelSnapshot | null {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < signature.length || !buffer.subarray(0, signature.length).equals(signature)) return null;

  let offset = signature.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
      const interlace = chunk[12];
      if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) return null;
    } else if (type === 'IDAT') {
      idat.push(chunk);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (width <= 0 || height <= 0 || idat.length === 0) return null;
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const rgba = new Uint8Array(width * height * 4);
  const previous = new Uint8Array(stride);
  const current = new Uint8Array(stride);
  let sourceOffset = 0;

  for (let y = 0; y < height; y++) {
    const filter = inflated[sourceOffset++];
    current.set(inflated.subarray(sourceOffset, sourceOffset + stride));
    sourceOffset += stride;
    unfilterScanline(current, previous, channels, filter);
    for (let x = 0; x < width; x++) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      rgba[target] = current[source];
      rgba[target + 1] = current[source + 1];
      rgba[target + 2] = current[source + 2];
      rgba[target + 3] = channels === 4 ? current[source + 3] : 255;
    }
    previous.set(current);
  }

  return { width, height, data: rgba };
}

function unfilterScanline(current: Uint8Array, previous: Uint8Array, channels: number, filter: number): void {
  for (let i = 0; i < current.length; i++) {
    const left = i >= channels ? current[i - channels] : 0;
    const up = previous[i] || 0;
    const upLeft = i >= channels ? previous[i - channels] || 0 : 0;
    if (filter === 1) current[i] = (current[i] + left) & 0xff;
    else if (filter === 2) current[i] = (current[i] + up) & 0xff;
    else if (filter === 3) current[i] = (current[i] + Math.floor((left + up) / 2)) & 0xff;
    else if (filter === 4) current[i] = (current[i] + paethPredictor(left, up, upLeft)) & 0xff;
  }
}

function paethPredictor(left: number, up: number, upLeft: number): number {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upLeft;
}
