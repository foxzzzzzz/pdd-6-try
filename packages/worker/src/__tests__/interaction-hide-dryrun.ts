/**
 * Read-only dry-run for the review interaction hide flow.
 *
 * Goal:
 * - Open review management.
 * - Navigate through "查看全部互动".
 * - Capture row-level candidates that contain a "隐藏评论" action.
 * - Run AI/rule judgment without clicking hide.
 */
import * as fs from 'fs';
import * as path from 'path';
import { eq } from 'drizzle-orm';
import { Page } from 'playwright';
import { getDb, schema } from '@pdd-inspector/core';
import { BrowserManager } from '../browser';
import { loadWorkspaceEnv } from '../env-loader';
import { createInteractionJudge } from '../ai/action-decisions';
import { getHeavyProvider } from '../ai/provider-factory';

const REVIEW_URL = 'https://mms.pinduoduo.com/goods/evaluation/index?msfrom=mms_sidenav';
const OUTPUT_DIR = path.resolve('./data/interaction-hide-dryrun');
const REPORT_FILE = path.resolve('../../docs/test-reports/interaction-hide-dryrun.md');

type StoreLike = {
  id: number;
  name: string;
  storageState: string | null;
  aiConfig: string | null;
};

type Candidate = {
  index: number;
  id: string;
  text: string;
  interactionTime: string | null;
  withinLast7Days: boolean;
  hasHideButton: boolean;
  hideButtonText: string | null;
  rowTag: string;
  rowClasses: string;
};

type CandidateWithJudgment = Candidate & {
  shouldHide: boolean;
  reason: string;
};

type DryRunReport = {
  generatedAt: string;
  store: { id: number; name: string };
  reviewUrl: string;
  interactionUrl: string;
  clickedEntryText: string | null;
  recentThirtyDaysSelection: string | null;
  lastSevenDaysWindow: { start: string; end: string };
  screenshotFiles: string[];
  candidates: CandidateWithJudgment[];
  diagnostics: {
    clickableTexts: string[];
    bodySample: string;
  };
};

async function main() {
  loadWorkspaceEnv();
  ensureDir(OUTPUT_DIR);
  ensureDir(path.dirname(REPORT_FILE));

  const store = await resolveStore();
  console.log(`Interaction hide dry-run: store=${store.id} ${store.name}`);

  const browser = new BrowserManager();
  const screenshotFiles: string[] = [];

  try {
    await browser.init(process.env.HEADLESS === 'true');
    const loggedIn = await browser.login(store.id, store.storageState);
    if (!loggedIn) {
      throw new Error('Login required. Please login in the opened browser and rerun this script.');
    }

    const page = browser.getPage();
    await browser.navigateWithRetry(REVIEW_URL);
    await page.waitForTimeout(2500);
    screenshotFiles.push(await capture(page, '01-review-management'));

    const clickedEntryText = await openAllInteractions(page);
    await page.waitForTimeout(2500);
    const recentThirtyDaysSelection = await selectRecentThirtyDays(page);
    if (recentThirtyDaysSelection) await page.waitForTimeout(1500);
    screenshotFiles.push(await capture(page, '02-all-interactions'));

    const candidates = await collectHideCandidates(page);
    const judge = createInteractionJudge(getHeavyProvider(store.aiConfig), ruleBasedInteractionJudge);
    const candidatesWithJudgment: CandidateWithJudgment[] = [];
    for (const candidate of candidates) {
      if (!candidate.withinLast7Days) {
        candidatesWithJudgment.push({
          ...candidate,
          shouldHide: false,
          reason: 'Skipped: interaction time is outside the last 7 days',
        });
        continue;
      }
      const judgment = await judge(candidate.text);
      candidatesWithJudgment.push({
        ...candidate,
        shouldHide: judgment.shouldHide,
        reason: judgment.reason,
      });
    }

    const diagnostics = {
      clickableTexts: await collectClickableTexts(page),
      bodySample: (await page.evaluate(() => document.body.innerText || '')).slice(0, 3000),
    };

    const report: DryRunReport = {
      generatedAt: new Date().toISOString(),
      store: { id: store.id, name: store.name },
      reviewUrl: REVIEW_URL,
      interactionUrl: page.url(),
      clickedEntryText,
      recentThirtyDaysSelection,
      lastSevenDaysWindow: buildLastSevenDaysWindow(),
      screenshotFiles,
      candidates: candidatesWithJudgment,
      diagnostics,
    };

    const jsonFile = path.join(OUTPUT_DIR, 'interaction-hide-report.json');
    fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), 'utf-8');
    fs.writeFileSync(path.join(OUTPUT_DIR, 'interaction-page-text.txt'), diagnostics.bodySample, 'utf-8');
    fs.writeFileSync(REPORT_FILE, buildMarkdown(report, jsonFile), 'utf-8');

    console.log(`Report: ${REPORT_FILE}`);
    console.log(`JSON: ${jsonFile}`);
    console.log(`Screenshots: ${OUTPUT_DIR}`);
    console.log(`Candidates with hide button: ${candidatesWithJudgment.length}`);
    console.log(`AI/rule negative candidates: ${candidatesWithJudgment.filter((item) => item.shouldHide).length}`);
  } finally {
    await browser.close();
  }
}

async function resolveStore(): Promise<StoreLike> {
  const db = await getDb();
  const explicitStoreId = parseNumberArg('--store-id');
  if (explicitStoreId != null) {
    const store = db.select().from(schema.stores).where(eq(schema.stores.id, explicitStoreId)).get();
    if (!store) throw new Error(`Store ${explicitStoreId} not found`);
    return store;
  }

  const stores = db.select().from(schema.stores).all();
  const active = stores.find((store) => store.status === 'active' && store.storageState) || stores.find((store) => store.storageState) || stores[0];
  if (!active) throw new Error('No store found');
  return active;
}

function parseNumberArg(name: string): number | null {
  const prefix = `${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix));
  if (!raw) return null;
  const value = Number(raw.slice(prefix.length));
  return Number.isFinite(value) ? value : null;
}

async function selectRecentThirtyDays(page: Page): Promise<string | null> {
  const selected = await page.evaluate(() => {
    const input = Array.from(document.querySelectorAll('input'))
      .find((el) => (el as HTMLInputElement).value === '近30天内') as HTMLInputElement | undefined;
    return input?.value || null;
  });
  if (selected) return selected;

  const opened = await page.evaluate(() => {
    const input = Array.from(document.querySelectorAll('input'))
      .find((el) => /近\d+天内|自定义时间/.test((el as HTMLInputElement).value || '')) as HTMLInputElement | undefined;
    const target = input?.closest('[data-testid="beast-core-select"], [class*="ST_outerWrapper"]') || input?.parentElement || input;
    if (!target) return false;
    (target as HTMLElement).click();
    return true;
  });
  if (!opened) return null;

  await page.waitForTimeout(500);
  const option = page.locator('li:has-text("近30天内")').last();
  if (!(await option.isVisible().catch(() => false))) return null;
  await option.click({ timeout: 5000 });
  await page.waitForTimeout(500);

  const query = page.locator('button:has-text("查询")').first();
  if (await query.isVisible().catch(() => false)) {
    await query.click({ timeout: 5000 });
    await page.waitForTimeout(2000);
  }
  return '近30天内';
}

async function openAllInteractions(page: Page): Promise<string | null> {
  const selectors = [
    'button:has-text("查看全部互动")',
    'a:has-text("查看全部互动")',
    'span:has-text("查看全部互动")',
    'div:has-text("查看全部互动")',
    'button:has-text("全部互动")',
    'a:has-text("全部互动")',
  ];

  for (const selector of selectors) {
    const loc = page.locator(selector);
    const count = await loc.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const item = loc.nth(i);
      if (!(await item.isVisible().catch(() => false))) continue;
      const text = ((await item.innerText().catch(() => '')) || '').trim();
      await item.scrollIntoViewIfNeeded().catch(() => undefined);
      await item.click({ timeout: 5000 });
      return text || selector;
    }
  }
  return null;
}

async function collectHideCandidates(page: Page): Promise<Candidate[]> {
  return page.evaluate(() => {
    const actionLabels = ['隐藏评论', '隐藏', 'Hide'];
    const clickableSelector = 'button, a, span, div[role="button"], [class*="button"], [class*="Button"]';
    const actionNodes = Array.from(document.querySelectorAll(clickableSelector))
      .filter((node) => {
        const text = ((node as HTMLElement).innerText || node.textContent || '').trim();
        return actionLabels.some((label) => text === label || text.includes(label));
      });

    const rows: HTMLElement[] = [];
    for (const node of actionNodes) {
      const el = node as HTMLElement;
      const row = el.closest('tr') || closestUsefulBlock(el);
      if (row && !rows.includes(row as HTMLElement)) rows.push(row as HTMLElement);
    }

    return rows.map((row, index) => {
      const text = (row.innerText || '').replace(/\s+/g, '\n').trim();
      const hideNode = Array.from(row.querySelectorAll(clickableSelector)).find((node) => {
        const value = ((node as HTMLElement).innerText || node.textContent || '').trim();
        return actionLabels.some((label) => value === label || value.includes(label));
      }) as HTMLElement | undefined;
      const idMatch = text.match(/\d{10,}/);
      const timeMatch = text.match(/\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?/);
      const interactionTime = timeMatch ? timeMatch[0] : null;
      return {
        index,
        id: idMatch ? idMatch[0] : `interaction-${index}`,
        text: text.slice(0, 1200),
        interactionTime,
        withinLast7Days: interactionTime ? isWithinLast7Days(interactionTime) : false,
        hasHideButton: Boolean(hideNode),
        hideButtonText: hideNode ? ((hideNode.innerText || hideNode.textContent || '').trim() || null) : null,
        rowTag: row.tagName.toLowerCase(),
        rowClasses: row.className || '',
      };
    });

    function closestUsefulBlock(el: HTMLElement): HTMLElement {
      let current: HTMLElement | null = el;
      for (let depth = 0; current && depth < 8; depth++) {
        const text = (current.innerText || '').trim();
        if (text.length > 30 && text.length < 3000) return current;
        current = current.parentElement;
      }
      return el.parentElement || el;
    }

    function isWithinLast7Days(value: string): boolean {
      const normalized = value.length === 10 ? `${value} 00:00:00` : value;
      const time = new Date(normalized.replace(/-/g, '/')).getTime();
      if (!Number.isFinite(time)) return false;
      const now = Date.now();
      return time >= now - 7 * 24 * 60 * 60 * 1000 && time <= now + 5 * 60 * 1000;
    }
  });
}

async function collectClickableTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('button, a, span, div[role="button"], [class*="button"], [class*="Button"]'));
    const texts = nodes
      .map((node) => ((node as HTMLElement).innerText || node.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((text) => text.length > 0 && text.length <= 80);
    return Array.from(new Set(texts)).slice(0, 300);
  });
}

async function capture(page: Page, name: string): Promise<string> {
  const file = path.join(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

function ruleBasedInteractionJudge(content: string): { shouldHide: boolean; reason: string } {
  const negativeWords = ['差', '烂', '垃圾', '骗', '假', '投诉', '退款', '退货', '不好', '太差', '失望', '质量差'];
  const found = negativeWords.filter((word) => content.includes(word));
  return {
    shouldHide: found.length > 0,
    reason: found.length > 0 ? `Rule keywords: ${found.join(', ')}` : 'Rule normal',
  };
}

function buildLastSevenDaysWindow(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    start: formatDateTime(start),
    end: formatDateTime(end),
  };
}

function formatDateTime(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

function buildMarkdown(report: DryRunReport, jsonFile: string): string {
  const lines = [
    '# Interaction Hide Dry-Run Report',
    '',
    `- Time: ${report.generatedAt}`,
    `- Store: ${report.store.id} ${report.store.name}`,
    `- Review URL: ${report.reviewUrl}`,
    `- Interaction URL: ${report.interactionUrl}`,
    `- Clicked entry: ${report.clickedEntryText || 'NOT FOUND'}`,
    `- Page time filter: ${report.recentThirtyDaysSelection || 'NOT FOUND'}`,
    `- Action time window: ${report.lastSevenDaysWindow.start} ~ ${report.lastSevenDaysWindow.end}`,
    `- JSON: ${jsonFile}`,
    '',
    '## Screenshots',
    '',
    ...report.screenshotFiles.map((file) => `- ${file}`),
    '',
    '## Candidates',
    '',
    '| # | id | interactionTime | within7d | hideButton | shouldHide | reason | text |',
    '|---|----|-----------------|----------|------------|------------|--------|------|',
  ];

  for (const candidate of report.candidates) {
    lines.push([
      candidate.index,
      escapeMarkdown(candidate.id),
      candidate.interactionTime || '-',
      String(candidate.withinLast7Days),
      candidate.hasHideButton ? escapeMarkdown(candidate.hideButtonText || 'yes') : 'no',
      String(candidate.shouldHide),
      escapeMarkdown(candidate.reason),
      escapeMarkdown(candidate.text.slice(0, 180)),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  lines.push('');
  lines.push('## Diagnostics');
  lines.push('');
  lines.push(`- Clickable text count: ${report.diagnostics.clickableTexts.length}`);
  lines.push('- The script is read-only and does not click "隐藏评论".');
  return lines.join('\n');
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
