/**
 * 评价管理 / 查看全部互动 / 隐藏评论
 */
import { BrowserManager } from '../browser';
import { InteractionActionDetail } from '@pdd-inspector/core';
import { ActionSafety, buildActionAudit, canSubmitAction, resolveActionSafety } from '../action-safety';

const INTERACTION_URL = 'https://mms.pinduoduo.com/goods/evalution/dynamic';

export interface InteractionActionResult { details: InteractionActionDetail[]; hidden: number; ignored: number; skipped: number; }
export interface InteractionRow { id: string; content: string; interactionTime: string | null; withinLast7Days: boolean; row?: any; }
type InteractionJudge = (content: string) => { shouldHide: boolean; reason: string } | Promise<{ shouldHide: boolean; reason: string }>;
export interface InteractionActionCandidate {
  id: number;
  interactionId: string | null;
  contentSummary: string | null;
  aiJudgment: string | null;
  action: 'hide';
}

export async function handleInteractions(browser: BrowserManager, storeId: number, judgeFunc: InteractionJudge, safetyInput: Partial<ActionSafety> = {}): Promise<InteractionActionResult> {
  const page = browser.getPage();
  const safety = resolveActionSafety(safetyInput);
  const result: InteractionActionResult = { details: [], hidden: 0, ignored: 0, skipped: 0 };

  try {
    await browser.navigateWithRetry(INTERACTION_URL);
    await page.waitForTimeout(2500);
    await selectRecentThirtyDays(browser);
    const pageScreenshot = await browser.takeScreenshot(storeId, 'interactions-scan');
    const interactions = await getInteractionRows(page);
    console.log(`  Found ${interactions.length} public interaction comments with hide action`);

    for (const interaction of interactions) {
      try {
        if (!interaction.withinLast7Days) {
          result.skipped++;
          result.details.push({
            interactionId: interaction.id,
            contentSummary: interaction.content.substring(0, 100),
            aiJudgment: 'skipped',
            action: 'ignore',
            ...buildActionAudit(safety, 'outside-last-7-days', { screenshotPath: pageScreenshot }),
          });
          continue;
        }

        const judgment = await judgeFunc(interaction.content);
        const detail: InteractionActionDetail = {
          interactionId: interaction.id,
          contentSummary: interaction.content.substring(0, 100),
          aiJudgment: judgment.shouldHide ? 'negative' : 'neutral',
          action: judgment.shouldHide ? 'hide' : 'ignore',
          status: judgment.shouldHide ? 'pending' : 'success',
          actionMode: safety.mode,
          screenshotPath: pageScreenshot,
        };
        result.details.push(detail);

        if (!judgment.shouldHide) {
          result.ignored++;
          continue;
        }

        result.skipped++;
        Object.assign(detail, buildActionAudit(safety, judgment.reason, { screenshotPath: pageScreenshot, approvalRequired: true }));
        continue;
      } catch (err) {
        result.skipped++;
        result.details.push({
          interactionId: interaction.id,
          contentSummary: interaction.content.substring(0, 100),
          aiJudgment: 'error',
          action: 'ignore',
          ...buildActionAudit(safety, '', { screenshotPath: pageScreenshot, errorMessage: err instanceof Error ? err.message : String(err) }),
        });
      }
      await page.waitForTimeout(1000 + Math.random() * 1500);
    }
  } catch (err) {
    console.error(`Interaction error for ${storeId}:`, err);
  }

  return result;
}

export async function executeInteractionActionCandidate(
  browser: BrowserManager,
  storeId: number,
  candidate: InteractionActionCandidate,
  safetyInput: Partial<ActionSafety> = {},
): Promise<InteractionActionDetail> {
  const page = browser.getPage();
  const safety = resolveActionSafety(safetyInput);
  const reason = candidate.aiJudgment || 'approved-hide';

  await browser.navigateWithRetry(INTERACTION_URL);
  await page.waitForTimeout(2500);
  await selectRecentThirtyDays(browser);
  const pageScreenshot = await browser.takeScreenshot(storeId, 'interaction-hide-candidate-scan');
  const interactions = await getInteractionRows(page);
  const interaction = findInteractionCandidateRow(interactions, candidate);
  const base = {
    interactionId: candidate.interactionId || candidate.id.toString(),
    contentSummary: candidate.contentSummary || '',
    aiJudgment: candidate.aiJudgment || 'negative',
    action: 'hide' as const,
  };

  if (!interaction) {
    return {
      ...base,
      ...buildActionAudit(safety, reason, { screenshotPath: pageScreenshot, errorMessage: 'Approved interaction candidate row not found' }),
    };
  }
  if (!interaction.withinLast7Days) {
    return {
      interactionId: interaction.id,
      contentSummary: interaction.content.substring(0, 100),
      aiJudgment: candidate.aiJudgment || 'negative',
      action: 'hide',
      ...buildActionAudit(safety, reason, { screenshotPath: pageScreenshot, errorMessage: 'Approved interaction is outside the last 7 days or missing interaction time' }),
    };
  }
  if (!canSubmitAction(safety, 'hide')) {
    return {
      interactionId: interaction.id,
      contentSummary: interaction.content.substring(0, 100),
      aiJudgment: candidate.aiJudgment || 'negative',
      action: 'hide',
      ...buildActionAudit(safety, reason, { screenshotPath: pageScreenshot }),
    };
  }

  const hideBtn = interaction.row ? await findRowButton(interaction.row, ['隐藏评论']) : null;
  if (!hideBtn) {
    return {
      interactionId: interaction.id,
      contentSummary: interaction.content.substring(0, 100),
      aiJudgment: candidate.aiJudgment || 'negative',
      action: 'hide',
      ...buildActionAudit(safety, reason, { screenshotPath: pageScreenshot, errorMessage: 'Hide comment button not found in approved candidate row' }),
    };
  }

  await browser.humanClick(hideBtn);
  await clickConfirmIfPresent(browser);
  const screenshotPath = await browser.takeScreenshot(storeId, 'interaction-hide-approved-submitted');
  return {
    interactionId: interaction.id,
    contentSummary: interaction.content.substring(0, 100),
    aiJudgment: candidate.aiJudgment || 'negative',
    action: 'hide',
    ...buildActionAudit(safety, reason, { submitted: true, screenshotPath }),
  };
}

function findInteractionCandidateRow(interactions: InteractionRow[], candidate: InteractionActionCandidate): InteractionRow | null {
  const expectedId = candidate.interactionId || '';
  const expectedContent = normalizeText(candidate.contentSummary || '');
  return interactions.find((interaction) => {
    if (expectedId && interaction.id === expectedId) return true;
    const actualContent = normalizeText(interaction.content);
    return Boolean(expectedContent) && (actualContent.includes(expectedContent) || expectedContent.includes(actualContent));
  }) || null;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, '').trim();
}

async function selectRecentThirtyDays(browser: BrowserManager): Promise<void> {
  const page = browser.getPage();
  const selected = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input'))
      .some((el) => (el as HTMLInputElement).value === '近30天内');
  });
  if (!selected) {
    const opened = await page.evaluate(() => {
      const input = Array.from(document.querySelectorAll('input'))
        .find((el) => /近\d+天内|自定义时间/.test((el as HTMLInputElement).value || '')) as HTMLInputElement | undefined;
      const target = input?.closest('[data-testid="beast-core-select"], [class*="ST_outerWrapper"]') || input?.parentElement || input;
      if (!target) return false;
      (target as HTMLElement).click();
      return true;
    });
    if (opened) {
      await page.waitForTimeout(500);
      const option = page.locator('li:has-text("近30天内")').last();
      if (await option.isVisible().catch(() => false)) {
        await browser.humanClick(option);
      }
    }
  }

  const query = page.locator('button:has-text("查询")').first();
  if (await query.isVisible().catch(() => false)) {
    await browser.humanClick(query);
  }
}

async function getInteractionRows(page: any): Promise<InteractionRow[]> {
  const rowHandles = await page.$$('tr');
  const rows: InteractionRow[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rowHandles.length; i++) {
    const text = await rowHandles[i].innerText().catch(() => '');
    const parsed = parseInteractionRowText(text, `interaction-${i}`);
    if (!parsed) continue;
    const hideBtn = await revealAndFindHideButton(rowHandles[i]);
    if (!hideBtn) continue;
    const key = `${parsed.id}|${parsed.content}|${parsed.interactionTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ ...parsed, row: rowHandles[i] });
  }

  return rows;
}

export function parseInteractionRowText(text: string, fallbackId = 'interaction-0', now = new Date()): InteractionRow | null {
  if (text.includes('公开评论')) return null;

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const timeIndex = lines.findIndex((line) => /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(line));
  const timeLine = timeIndex >= 0 ? lines[timeIndex] : null;
  if (!timeLine) return null;
  let content: string | undefined;
  for (let i = (timeIndex >= 0 ? timeIndex : lines.length) - 1; i >= 0; i--) {
    if (isInteractionMetaLine(lines[i])) continue;
    content = lines[i];
    break;
  }
  content ||= lines.find((line) => {
    if (isInteractionMetaLine(line)) return false;
    return line.length >= 2;
  });

  if (!content) return null;
  const idMatch = text.match(/\d{10,}/);
  return {
    id: idMatch?.[0] || `${fallbackId}-${timeLine || 'unknown-time'}`,
    content,
    interactionTime: timeLine || null,
    withinLast7Days: timeLine ? isWithinLast7Days(timeLine, now) : false,
  };
}

function isInteractionMetaLine(line: string): boolean {
  if (line === '买家') return true;
  if (line === '回复' || line === '隐藏评论' || line === '查看详情') return true;
  if (/^\d{4}-\d{2}-\d{2}/.test(line)) return true;
  return line.length < 2;
}

async function revealAndFindHideButton(row: any): Promise<any> {
  await row.hover?.().catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 200));
  return findRowButton(row, ['隐藏评论']);
}

export function isWithinLast7Days(value: string, now = new Date()): boolean {
  const normalized = value.length === 10 ? `${value} 00:00:00` : value;
  const time = new Date(normalized.replace(/-/g, '/')).getTime();
  if (!Number.isFinite(time)) return false;
  const end = now.getTime();
  return time >= end - 7 * 24 * 60 * 60 * 1000 && time <= end + 5 * 60 * 1000;
}

async function findRowButton(row: any, labels: string[]): Promise<any> {
  for (const label of labels) {
    const btn = row.locator
      ? row.locator(`button:has-text("${label}"), a:has-text("${label}"), span:has-text("${label}"), div[role="button"]:has-text("${label}")`).first()
      : null;
    if (btn && await btn.isVisible().catch(() => false)) return btn;
    const handle = await row.$?.(`button:has-text("${label}"), a:has-text("${label}"), span:has-text("${label}")`).catch(() => null);
    if (handle) return handle;
  }
  return null;
}

async function clickConfirmIfPresent(browser: BrowserManager): Promise<void> {
  const page = browser.getPage();
  for (const label of ['确认', '确定', '知道了']) {
    const btn = page.locator(`button:has-text("${label}"), a:has-text("${label}")`).last();
    if (await btn.isVisible().catch(() => false)) {
      await browser.humanClick(btn).catch(() => undefined);
      return;
    }
  }
}
