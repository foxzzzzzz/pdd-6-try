import * as fs from 'fs';
import * as path from 'path';

export interface BrowserEnvironmentStatus {
  ok: boolean;
  channel: string;
  systemChromeRequired: boolean;
  chromeExecutablePath: string | null;
  message: string;
}

type EnvLike = Record<string, string | undefined>;
type ExistsFn = (filePath: string) => boolean;

export function getBrowserChannel(env: EnvLike = process.env): string {
  return env.PLAYWRIGHT_CHROME_CHANNEL?.trim() || 'chrome';
}

export function getBrowserEnvironmentStatus(
  env: EnvLike = process.env,
  platform = process.platform,
  exists: ExistsFn = fs.existsSync,
): BrowserEnvironmentStatus {
  const channel = getBrowserChannel(env);
  const systemChromeRequired = channel !== 'chromium';
  if (!systemChromeRequired) {
    return {
      ok: true,
      channel,
      systemChromeRequired,
      chromeExecutablePath: null,
      message: 'Using Playwright bundled Chromium',
    };
  }

  const chromeExecutablePath = findSystemChromeExecutable(env, platform, exists);
  if (chromeExecutablePath) {
    return {
      ok: true,
      channel,
      systemChromeRequired,
      chromeExecutablePath,
      message: `System Chrome available: ${chromeExecutablePath}`,
    };
  }

  return {
    ok: false,
    channel,
    systemChromeRequired,
    chromeExecutablePath: null,
    message: '当前机器没有安装 Chrome，请先安装 Google Chrome，否则无法进行正常巡店。',
  };
}

export function findSystemChromeExecutable(
  env: EnvLike = process.env,
  platform = process.platform,
  exists: ExistsFn = fs.existsSync,
): string | null {
  const explicit = env.CHROME_EXECUTABLE_PATH?.trim();
  if (explicit) return exists(explicit) ? explicit : null;

  for (const candidate of getChromeExecutableCandidates(env, platform)) {
    if (exists(candidate)) return candidate;
  }
  return null;
}

function getChromeExecutableCandidates(env: EnvLike, platform: string): string[] {
  if (platform === 'win32') {
    return [
      env.PROGRAMFILES ? path.join(env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
      env['PROGRAMFILES(X86)'] ? path.join(env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
      env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
    ].filter(Boolean) as string[];
  }
  if (platform === 'darwin') {
    return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/opt/google/chrome/chrome',
  ];
}
