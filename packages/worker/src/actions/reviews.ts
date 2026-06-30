/**
 * 评价管理操作 — 好评回复 + 差评举报
 */
import { BrowserManager } from '../browser';
import { ReviewActionDetail } from '@pdd-inspector/core';
import { ActionSafety, buildActionAudit, canSubmitAction, requiresApproval, resolveActionSafety } from '../action-safety';
import * as fs from 'fs';
import * as path from 'path';

const REVIEW_URL = 'https://mms.pinduoduo.com/goods/evaluation/index?msfrom=mms_sidenav';
const REVIEW_ACTION_WINDOW_HOURS = 72;
const REVIEW_DEBUG_DIR = path.resolve(process.env.REVIEW_DEBUG_DIR || './data/action-debug/reviews');

export interface ReviewActionResult { details: ReviewActionDetail[]; replied: number; reported: number; skipped: number; failed: number; }
interface ReviewRow { id: string; content: string; stars: number; createdAt: string | null; alreadyReported?: boolean; row?: any; }
interface ReviewRowInput { text: string; domStars: number | null; row?: any; }
type ReportTemplateResolver = (r: { content: string; stars: number }) => string | Promise<string>;
export interface ReviewActionCandidate {
  id: number;
  reviewId: string | null;
  reviewContent: string | null;
  reviewStars: number | null;
  actionType: 'reply' | 'report';
  actionContent: string | null;
}

export async function replyToGoodReviews(browser: BrowserManager, storeId: number, replyTemplate: string, safetyInput: Partial<ActionSafety> = {}): Promise<ReviewActionResult> {
  const page = browser.getPage();
  const safety = resolveActionSafety(safetyInput);
  let submittedCount = 0;
  const result: ReviewActionResult = { details: [], replied: 0, reported: 0, skipped: 0, failed: 0 };
  try {
    await browser.navigateWithRetry(REVIEW_URL);
    await filterByStars(browser, page, [4, 5]);
    const reviews = (await getReviewRows(page)).filter((review) => review.stars >= 4);
    console.log(`  Found ${reviews.length} good reviews`);
    const pageScreenshot = await browser.takeScreenshot(storeId, 'reviews-reply-scan');
    await dismissBlockingModal(page);

    for (var _i = 0; _i < reviews.length; _i++) {
      var review = reviews[_i];
      try {
        if (!isReviewWithinLastHours(review.createdAt, new Date(), REVIEW_ACTION_WINDOW_HOURS)) {
          result.skipped++;
          result.details.push({
            reviewId: review.id,
            reviewContent: review.content,
            reviewStars: review.stars,
            reviewCreatedAt: review.createdAt,
            actionType: 'reply',
            actionContent: replyTemplate,
            ...buildActionAudit(safety, replyTemplate, { screenshotPath: pageScreenshot, errorMessage: 'Review is outside the last 72 hours or missing review time' }),
          });
          continue;
        }
        if (!canSubmitAction(safety, 'reply') || (safety.maxActions != null && submittedCount >= safety.maxActions)) {
          result.skipped++;
          result.details.push({
            reviewId: review.id,
            reviewContent: review.content,
            reviewStars: review.stars,
            reviewCreatedAt: review.createdAt,
            actionType: 'reply',
            actionContent: replyTemplate,
            ...buildActionAudit(safety, replyTemplate, { screenshotPath: pageScreenshot, approvalRequired: requiresApproval(safety, 'reply') && !safety.approvedActions.reply }),
          });
          continue;
        }
        var replyBtn = review.row ? await findButton(review.row, ['回复/互动', '回复', 'Reply']) : null;
        if (!replyBtn) { result.skipped++; result.details.push({ reviewId: review.id, reviewContent: review.content, reviewStars: review.stars, reviewCreatedAt: review.createdAt, actionType: 'reply', actionContent: '', ...buildActionAudit(safety, '', { screenshotPath: pageScreenshot, errorMessage: 'Reply button not found' }) }); continue; }
        await openQuickReplyModal(browser, replyBtn);
        await fillQuickReplyModal(browser, replyTemplate);
        const submitBtn = await findQuickReplySubmitButton(page);
        if (submitBtn) { await browser.humanClick(submitBtn); submittedCount++; const screenshotPath = await browser.takeScreenshot(storeId, 'review-reply-submitted'); result.replied++; result.details.push({ reviewId: review.id, reviewContent: review.content, reviewStars: review.stars, reviewCreatedAt: review.createdAt, actionType: 'reply', actionContent: replyTemplate, ...buildActionAudit(safety, replyTemplate, { submitted: true, screenshotPath }) }); }
        else { result.failed++; result.details.push({ reviewId: review.id, reviewContent: review.content, reviewStars: review.stars, reviewCreatedAt: review.createdAt, actionType: 'reply', actionContent: replyTemplate, ...buildActionAudit(safety, replyTemplate, { screenshotPath: pageScreenshot, errorMessage: 'Quick reply submit button not found' }) }); }
      } catch (err) {
        result.failed++;
        result.details.push({ reviewId: review.id, reviewContent: review.content, reviewStars: review.stars, reviewCreatedAt: review.createdAt, actionType: 'reply', actionContent: replyTemplate, ...buildActionAudit(safety, replyTemplate, { screenshotPath: pageScreenshot, errorMessage: err instanceof Error ? err.message : String(err) }) });
      }
      await page.waitForTimeout(1500 + Math.random() * 3000);
    }
    await browser.takeScreenshot(storeId, 'reviews-replied');
  } catch (err) { console.error(`Reply error for ${storeId}:`, err); }
  return result;
}

export async function reportBadReviews(browser: BrowserManager, storeId: number, getReportTemplate: ReportTemplateResolver, safetyInput: Partial<ActionSafety> = {}): Promise<ReviewActionResult> {
  const page = browser.getPage();
  const safety = resolveActionSafety(safetyInput);
  const result: ReviewActionResult = { details: [], replied: 0, reported: 0, skipped: 0, failed: 0 };
  try {
    await browser.navigateWithRetry(REVIEW_URL);
    const reviews = await getReviewRowsForStars(browser, page, [1, 2, 3]);
    const alreadyReportedCount = reviews.filter((review) => review.alreadyReported).length;
    console.log(`  Found ${reviews.length} bad reviews (${alreadyReportedCount} already reported)`);
    const pageScreenshot = await browser.takeScreenshot(storeId, 'reviews-report-scan');

    for (var _i = 0; _i < reviews.length; _i++) {
      var review = reviews[_i];
      var template = '';
      try {
        if (!isReviewWithinLastHours(review.createdAt, new Date(), REVIEW_ACTION_WINDOW_HOURS)) {
          result.skipped++;
          result.details.push({
            reviewId: review.id,
            reviewContent: review.content,
            reviewStars: review.stars,
            reviewCreatedAt: review.createdAt,
            actionType: 'report',
            actionContent: '',
            ...buildActionAudit(safety, '', { screenshotPath: pageScreenshot, errorMessage: 'Review is outside the last 72 hours or missing review time' }),
          });
          continue;
        }
        if (review.alreadyReported) {
          result.skipped++;
          result.details.push({
            reviewId: review.id,
            reviewContent: review.content,
            reviewStars: review.stars,
            reviewCreatedAt: review.createdAt,
            actionType: 'report',
            actionContent: '',
            ...buildActionAudit(safety, '', { screenshotPath: pageScreenshot, errorMessage: 'Review is already reported and pending platform audit' }),
          });
          continue;
        }
        template = await getReportTemplate(review);
        result.skipped++;
        result.details.push(buildPendingReportApprovalDetail(review, template, safety, pageScreenshot));
        continue;
      } catch (err) {
        result.failed++;
        result.details.push({ reviewId: review.id, reviewContent: review.content, reviewStars: review.stars, reviewCreatedAt: review.createdAt, actionType: 'report', actionContent: template, ...buildActionAudit(safety, template, { screenshotPath: pageScreenshot, errorMessage: err instanceof Error ? err.message : String(err) }) });
      }
      await page.waitForTimeout(3000 + Math.random() * 5000);
    }
    await browser.takeScreenshot(storeId, 'reviews-report-scanned');
  } catch (err) { console.error(`Report error for ${storeId}:`, err); }
  return result;
}

export function buildPendingReportApprovalDetail(
  review: Pick<ReviewRow, 'id' | 'content' | 'stars' | 'createdAt'>,
  template: string,
  safety: ActionSafety,
  screenshotPath?: string,
): ReviewActionDetail {
  return {
    reviewId: review.id,
    reviewContent: review.content,
    reviewStars: review.stars,
    reviewCreatedAt: review.createdAt,
    actionType: 'report',
    actionContent: template,
    ...buildActionAudit(safety, template, { screenshotPath, approvalRequired: true }),
  };
}

export async function executeReviewActionCandidate(
  browser: BrowserManager,
  storeId: number,
  candidate: ReviewActionCandidate,
  safetyInput: Partial<ActionSafety> = {},
): Promise<ReviewActionDetail> {
  const page = browser.getPage();
  const safety = resolveActionSafety(safetyInput);
  const actionContent = candidate.actionContent || '';
  const expectedStars = candidate.reviewStars || (candidate.actionType === 'reply' ? 5 : 1);

  await browser.navigateWithRetry(REVIEW_URL);
  await filterByStars(browser, page, candidate.actionType === 'reply' ? [4, 5] : [1, 2, 3]);
  await dismissBlockingModal(page);

  const pageScreenshot = await browser.takeScreenshot(storeId, `review-${candidate.actionType}-candidate-scan`);
  const reviews = (await getReviewRows(page)).filter((review) =>
    candidate.actionType === 'reply' ? review.stars >= 4 : review.stars <= 3,
  );
  const review = findReviewCandidateRow(reviews, candidate);
  const base = {
    reviewId: candidate.reviewId || candidate.id.toString(),
    reviewContent: candidate.reviewContent || '',
    reviewStars: expectedStars,
    actionType: candidate.actionType,
    actionContent,
  };

  if (!review) {
    return {
      ...base,
      ...buildActionAudit(safety, actionContent, { screenshotPath: pageScreenshot, errorMessage: 'Approved review candidate row not found' }),
    };
  }
  if (!isReviewWithinLastHours(review.createdAt, new Date(), REVIEW_ACTION_WINDOW_HOURS)) {
    return {
      reviewId: review.id,
      reviewContent: review.content,
      reviewStars: review.stars,
      reviewCreatedAt: review.createdAt,
      actionType: candidate.actionType,
      actionContent,
      ...buildActionAudit(safety, actionContent, { screenshotPath: pageScreenshot, errorMessage: 'Approved review is outside the last 72 hours or missing review time' }),
    };
  }
  if (!canSubmitAction(safety, candidate.actionType)) {
    return {
      reviewId: review.id,
      reviewContent: review.content,
      reviewStars: review.stars,
      reviewCreatedAt: review.createdAt,
      actionType: candidate.actionType,
      actionContent,
      ...buildActionAudit(safety, actionContent, { screenshotPath: pageScreenshot }),
    };
  }

  if (candidate.actionType === 'reply') {
    const replyBtn = review.row ? await findButton(review.row, ['回复/互动', '回复', 'Reply']) : null;
    if (!replyBtn) {
      return {
        reviewId: review.id,
        reviewContent: review.content,
        reviewStars: review.stars,
        reviewCreatedAt: review.createdAt,
        actionType: 'reply',
        actionContent,
        ...buildActionAudit(safety, actionContent, { screenshotPath: pageScreenshot, errorMessage: 'Reply button not found in approved candidate row' }),
      };
    }
    await openQuickReplyModal(browser, replyBtn);
    await fillQuickReplyModal(browser, actionContent);
    const submitBtn = await findQuickReplySubmitButton(page);
    if (!submitBtn) {
      return {
        reviewId: review.id,
        reviewContent: review.content,
        reviewStars: review.stars,
        reviewCreatedAt: review.createdAt,
        actionType: 'reply',
        actionContent,
        ...buildActionAudit(safety, actionContent, { screenshotPath: pageScreenshot, errorMessage: 'Quick reply submit button not found' }),
      };
    }
    await browser.humanClick(submitBtn);
    const screenshotPath = await browser.takeScreenshot(storeId, 'review-reply-approved-submitted');
    return {
      reviewId: review.id,
      reviewContent: review.content,
      reviewStars: review.stars,
      reviewCreatedAt: review.createdAt,
      actionType: 'reply',
      actionContent,
      ...buildActionAudit(safety, actionContent, { submitted: true, screenshotPath }),
    };
  }

  const reportBtn = review.row ? await findButton(review.row, ['举报', 'Report']) : null;
  if (!reportBtn) {
    return {
      reviewId: review.id,
      reviewContent: review.content,
      reviewStars: review.stars,
      reviewCreatedAt: review.createdAt,
      actionType: 'report',
      actionContent,
      ...buildActionAudit(safety, actionContent, { screenshotPath: pageScreenshot, errorMessage: 'Report button not found in approved candidate row' }),
    };
  }
  await browser.humanClick(reportBtn);
  const textarea = await page.$('textarea, [contenteditable="true"]');
  if (textarea) {
    await browser.humanFill(textarea, actionContent);
  }
  const submitBtn = await findButton(page, ['提交', '确认举报', 'Submit']);
  if (!submitBtn) {
    return {
      reviewId: review.id,
      reviewContent: review.content,
      reviewStars: review.stars,
      reviewCreatedAt: review.createdAt,
      actionType: 'report',
      actionContent,
      ...buildActionAudit(safety, actionContent, { screenshotPath: pageScreenshot, errorMessage: 'Report submit button not found' }),
    };
  }
  await browser.humanClick(submitBtn);
  const screenshotPath = await browser.takeScreenshot(storeId, 'review-report-approved-submitted');
  return {
    reviewId: review.id,
    reviewContent: review.content,
    reviewStars: review.stars,
    reviewCreatedAt: review.createdAt,
    actionType: 'report',
    actionContent,
    ...buildActionAudit(safety, actionContent, { submitted: true, screenshotPath }),
  };
}

function findReviewCandidateRow(reviews: ReviewRow[], candidate: ReviewActionCandidate): ReviewRow | null {
  const expectedId = candidate.reviewId || '';
  const expectedContent = normalizeText(candidate.reviewContent || '');
  return reviews.find((review) => {
    if (expectedId && review.id === expectedId) return true;
    const actualContent = normalizeText(review.content);
    return Boolean(expectedContent) && (actualContent.includes(expectedContent) || expectedContent.includes(actualContent));
  }) || null;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, '').trim();
}

async function filterByStars(browser: BrowserManager, page: any, stars: number[]): Promise<void> {
  const filtered = await page.evaluate((targetStars: number[]) => {
    const isVisible = (el: Element) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const textOf = (el: Element) => ((el as HTMLElement).innerText || el.textContent || '').replace(/\s+/g, '');
    const scoreSection = Array.from(document.querySelectorAll('[class*="evaluation_search_content"]'))
      .filter((el) => isVisible(el))
      .find((el) => {
        const text = textOf(el);
        return text.includes('用户评价得分') && text.includes('1星') && text.includes('5星');
      });
    const searchRoot = scoreSection?.closest('[class*="evaluation_search_mainContent"]');
    if (!scoreSection || !searchRoot) return { clicked: 0, queried: false, url: location.href };

    let clicked = 0;
    for (const star of targetStars) {
      const starText = `${star}星`;
      const target = Array.from(scoreSection.querySelectorAll('button, a, label, span, div'))
        .filter((el) => isVisible(el))
        .filter((el) => textOf(el) === starText)
        .sort((a, b) => {
          const ar = a.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          return (ar.width * ar.height) - (br.width * br.height);
        })[0] as HTMLElement | undefined;
      if (target) {
        target.click();
        clicked++;
      }
    }

    const query = Array.from(searchRoot.querySelectorAll('button, a, [role="button"]'))
      .filter((el) => isVisible(el))
      .find((el) => textOf(el) === '查询') as HTMLElement | undefined;
    if (!query) return { clicked, queried: false, url: location.href };
    query.click();
    return { clicked, queried: true, url: location.href };
  }, stars).catch(() => ({ clicked: 0, queried: false, url: page.url() }));
  if (!filtered.clicked || !filtered.queried) {
    console.log(`  Review star filter did not find scoped controls: clicked=${filtered.clicked} queried=${filtered.queried} url=${filtered.url}`);
  }
  await page.waitForTimeout(1500);
  if (!page.url().includes('/goods/evaluation/')) {
    console.log(`  Review star filter left evaluation page, navigating back: ${page.url()}`);
    await browser.navigateWithRetry(REVIEW_URL).catch(() => undefined);
  }
}

async function dismissBlockingModal(page: any): Promise<void> {
  await page.evaluate(() => {
    const modals = Array.from(document.querySelectorAll('[data-testid="beast-core-modal"], [class*="MDL_modal"]'));
    for (const modal of modals) {
      const text = (modal as HTMLElement).innerText || '';
      if (!text.includes('评价互动') && !text.includes('回复和管控')) continue;
      const buttons = Array.from(modal.querySelectorAll('button, a, span, div'));
      const ok = buttons.find((el) => ((el as HTMLElement).innerText || el.textContent || '').trim() === '知道了' || ((el as HTMLElement).innerText || el.textContent || '').trim() === '我知道了');
      if (ok) {
        (ok as HTMLElement).click();
        return;
      }
      const close = modal.querySelector('[class*="close"], [aria-label*="close"], [aria-label*="关闭"]');
      if (close) (close as HTMLElement).click();
    }
  }).catch(() => undefined);
  await page.waitForTimeout(500);

  for (const label of ['知道了', '我知道了']) {
    const btn = await page.$(`button:has-text("${label}"), a:has-text("${label}"), span:has-text("${label}")`).catch(() => null);
    if (btn) {
      await btn.click({ timeout: 3000, force: true }).catch(() => undefined);
      await page.waitForTimeout(500);
      return;
    }
  }
  const closeBtn = await page.$('[data-testid="beast-core-modal"] [class*="close"], [data-testid="beast-core-modal"] [aria-label*="close"], [data-testid="beast-core-modal"] [aria-label*="关闭"]').catch(() => null);
  if (closeBtn) {
    await closeBtn.click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(500);
  }
}

async function openQuickReplyModal(browser: BrowserManager, replyBtn: any): Promise<void> {
  const page = browser.getPage();
  await dismissBlockingModal(page);
  try {
    await browser.humanClick(replyBtn, { force: true });
  } catch (err) {
    if (await hasQuickReplyModal(page)) return;
    throw err;
  }
  await waitForQuickReplyModal(page);
}

async function fillQuickReplyModal(browser: BrowserManager, content: string): Promise<void> {
  const page = browser.getPage();
  await waitForQuickReplyModal(page);
  const textarea = await page.$('[data-testid="beast-core-modal"] textarea, [class*="MDL_modal"] textarea, textarea, [contenteditable="true"]');
  if (!textarea) throw new Error('Quick reply textarea not found');
  await browser.humanFill(textarea, content);
}

async function findQuickReplySubmitButton(page: any): Promise<any> {
  return page.$('[data-testid="beast-core-modal"] button:has-text("回复"), [data-testid="beast-core-modal"] a:has-text("回复"), [class*="MDL_modal"] button:has-text("回复"), [class*="MDL_modal"] a:has-text("回复"), button:has-text("回复")');
}

async function waitForQuickReplyModal(page: any): Promise<void> {
  await page.waitForFunction(() => {
    return Array.from(document.querySelectorAll('[data-testid="beast-core-modal"], [class*="MDL_modal"]'))
      .some((el) => ((el as HTMLElement).innerText || '').includes('快捷回复'));
  }, { timeout: 8000 });
}

async function hasQuickReplyModal(page: any): Promise<boolean> {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('[data-testid="beast-core-modal"], [class*="MDL_modal"]'))
      .some((el) => ((el as HTMLElement).innerText || '').includes('快捷回复'));
  }).catch(() => false);
}

async function getReviewRows(page: any): Promise<ReviewRow[]> {
  const tableRows = await collectReviewRows(await page.$$('tr'));
  if (tableRows.length > 0) return tableRows;
  return collectReviewRows(await page.$$('[class*="table"] [class*="row"], [class*="review"], [class*="comment"], [class*="evaluation"], [class*="item"]'));
}

async function getReviewRowsForStars(browser: BrowserManager, page: any, stars: number[]): Promise<ReviewRow[]> {
  const rows: ReviewRow[] = [];
  const seen = new Set<string>();
  await filterByStars(browser, page, stars);
  const reviewRows = await getReviewRows(page);
  const reviews = reviewRows.filter((review) => stars.includes(review.stars));
  if (reviews.length === 0) {
    const debugPath = await writeReviewScanDebug(page, stars[0] || 0, reviewRows);
    if (debugPath) console.log(`  Review scan debug for ${stars.join('/')} stars: ${debugPath}`);
  }
  for (const review of reviews) {
    const key = `${review.id}|${review.content}|${review.stars}|${review.createdAt || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(review);
  }
  return rows;
}

async function writeReviewScanDebug(page: any, star: number, parsedRows: ReviewRow[]): Promise<string | null> {
  try {
    fs.mkdirSync(REVIEW_DEBUG_DIR, { recursive: true });
    const timestamp = Date.now();
    const rowHandles = await page.$$('tr, [class*="table"] [class*="row"], [class*="review"], [class*="comment"], [class*="evaluation"], [class*="item"]');
    const rows = [];
    for (let i = 0; i < Math.min(rowHandles.length, 80); i++) {
      const text = await rowHandles[i].innerText().catch(() => '');
      const domStars = await extractReviewStarsFromRow(rowHandles[i]);
      const parsed = parseReviewRowText(text, `debug-${i}`, domStars) || parseReviewBodyRowText(text, `debug-${i}`, domStars);
      rows.push({
        index: i,
        domStars,
        parsed: parsed ? {
          id: parsed.id,
          stars: parsed.stars,
          createdAt: parsed.createdAt,
          content: parsed.content,
        } : null,
        text: text.slice(0, 1200),
      });
    }
    const controls = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, a, label, span, div'))
        .map((el) => ((el as HTMLElement).innerText || el.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((text) => /[1-5]\s*星|评价|举报|回复/.test(text))
        .slice(0, 120);
    }).catch(() => []);
    const report = {
      star,
      url: page.url(),
      generatedAt: new Date().toISOString(),
      parsedRowsForAllStars: parsedRows.map((row) => ({
        id: row.id,
        stars: row.stars,
        createdAt: row.createdAt,
        content: row.content,
      })),
      controls,
      rows,
    };
    const jsonPath = path.join(REVIEW_DEBUG_DIR, `bad-review-star-${star}-${timestamp}.json`);
    const htmlPath = path.join(REVIEW_DEBUG_DIR, `bad-review-star-${star}-${timestamp}.html`);
    const screenshotPath = path.join(REVIEW_DEBUG_DIR, `bad-review-star-${star}-${timestamp}.png`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
    fs.writeFileSync(htmlPath, await page.content(), 'utf8');
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
    return jsonPath;
  } catch (err) {
    console.log(`  Review scan debug failed for ${star} star: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function collectReviewRows(rowHandles: any[]): Promise<ReviewRow[]> {
  const inputs: ReviewRowInput[] = [];
  for (let i = 0; i < rowHandles.length; i++) {
    const text = await rowHandles[i].innerText().catch(() => '');
    const domStars = await extractReviewStarsFromRow(rowHandles[i]);
    inputs.push({ text, domStars, row: rowHandles[i] });
  }
  return parseReviewGroupedRows(inputs);
}

export function parseReviewGroupedRows(inputs: ReviewRowInput[]): ReviewRow[] {
  const reviews: ReviewRow[] = [];
  const seen = new Set<string>();
  let pendingStars: number | null = null;
  let pendingAlreadyReported = false;
  for (let i = 0; i < inputs.length; i++) {
    const { text, domStars, row } = inputs[i];
    const starsForRow = domStars || pendingStars;
    const review = parseReviewRowText(text, `r-${i}`, starsForRow) || parseReviewBodyRowText(text, `r-${i}`, starsForRow);
    if (!review && domStars && text.includes('\u7528\u6237\u8bc4\u4ef7\u5206')) {
      pendingStars = domStars;
      pendingAlreadyReported = text.includes('\u5df2\u4e3e\u62a5');
      continue;
    }
    if (!review) continue;
    const key = `${review.id}|${review.content}|${review.stars}`;
    if (seen.has(key)) continue;
    seen.add(key);
    reviews.push({ ...review, alreadyReported: review.alreadyReported || pendingAlreadyReported || text.includes('\u5df2\u4e3e\u62a5'), row });
    pendingStars = null;
    pendingAlreadyReported = false;
  }
  return reviews;
}

export function parseReviewRowText(text: string, fallbackId = 'r-0', domStars: number | null = null): ReviewRow | null {
  if (!text.includes('用户评价分')) return null;
  const scoreLine = text.split(/\r?\n/).find((line) => line.includes('用户评价分')) || text;
  const starChars = scoreLine.match(/[★]+/)?.[0] || '';
  const numericStars = scoreLine.match(/([1-5])\s*星/);
  const stars = starChars.length > 0 ? Math.min(starChars.length, 5) : numericStars ? parseInt(numericStars[1], 10) : domStars || 0;
  if (stars < 1 || stars > 5) return null;

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const content = lines.find((line) => {
    if (line.includes('用户评价分')) return false;
    if (/^\d{4}-\d{2}-\d{2}/.test(line)) return false;
    if (/^\u5df2\u8fd4.*\u73b0\u91d1/.test(line)) return false;
    if (/^\u5df2\u4e3e\u62a5/.test(line)) return false;
    if (/^(查看订单|举报|回复\/互动|回复|订单编号|买家昵称|ID:|被点赞数|互动数)/.test(line)) return false;
    return line.length >= 4;
  });
  if (!content) return null;

  const orderIdMatch = text.match(/订单编号[:：]\s*([0-9-]+)/);
  const idMatch = orderIdMatch?.[1].replace(/\D/g, '') || text.match(/\d{15,}/)?.[0];
  return { id: idMatch || fallbackId, content, stars, createdAt: extractReviewTimestampText(text), alreadyReported: text.includes('\u5df2\u4e3e\u62a5') };
}

export function parseReviewBodyRowText(text: string, fallbackId = 'r-0', domStars: number | null = null): ReviewRow | null {
  if (!text.includes('订单编号') || !text.includes('回复/互动')) return null;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const content = lines.find((line) => {
    if (/^\d{4}-\d{2}-\d{2}/.test(line)) return false;
    if (/^\u5df2\u8fd4.*\u73b0\u91d1/.test(line)) return false;
    if (/^\u5df2\u4e3e\u62a5/.test(line)) return false;
    if (/^(查看订单|举报|回复\/互动|回复|订单编号|买家昵称|ID:)/.test(line)) return false;
    return line.length >= 4;
  });
  if (!content) return null;

  const stars = domStars || inferReviewStars(content);
  if (stars == null) return null;
  const orderIdMatch = text.match(/订单编号[:：]\s*([0-9-]+)/);
  const idMatch = orderIdMatch?.[1].replace(/\D/g, '') || text.match(/\d{15,}/)?.[0];
  return { id: idMatch || fallbackId, content, stars, createdAt: extractReviewTimestampText(text), alreadyReported: text.includes('\u5df2\u4e3e\u62a5') };
}

async function extractReviewStarsFromRow(row: any): Promise<number | null> {
  return row.evaluate((el: HTMLElement) => {
    const isVisible = (node: Element) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const isRedLike = (value: string) => {
      const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return /#f|red|rgb/i.test(value);
      const [, r, g, b] = m.map(Number);
      return r >= 150 && g <= 120 && b <= 120;
    };
    const filledStars = Array.from(el.querySelectorAll('[data-testid*="star_filled"], [class*="star_filled"]'))
      .filter((node) => {
        const style = window.getComputedStyle(node);
        const color = style.color || style.fill || style.stroke || '';
        return isRedLike(color) || /star_filled/i.test([
          node.getAttribute('data-testid') || '',
          typeof (node as HTMLElement).className === 'string' ? (node as HTMLElement).className : '',
        ].join(' '));
      }).length;
    if (filledStars > 0) return Math.min(filledStars, 5);

    let textStars = 0;
    for (const node of Array.from(el.querySelectorAll('*'))) {
      const text = (node.textContent || '').trim();
      if (/^[★☆]+$/.test(text)) {
        const redStars = Array.from(text).filter((char) => char === '★').length;
        textStars = Math.max(textStars, Math.min(redStars || text.length, 5));
      }
    }
    if (textStars > 0) return textStars;

    const candidates = Array.from(el.querySelectorAll('*')).filter((node) => {
      if (!isVisible(node)) return false;
      const meta = [
        typeof node.className === 'string' ? node.className : '',
        node.getAttribute('aria-label') || '',
        node.getAttribute('title') || '',
        node.getAttribute('data-testid') || '',
      ].join(' ');
      if (!/(star|rate|score|评价分|星)/i.test(meta)) return false;
      const style = window.getComputedStyle(node);
      const color = style.color || style.fill || style.stroke || '';
      return isRedLike(color);
    });
    return candidates.length > 0 ? Math.min(candidates.length, 5) : null;
  }).catch(() => null);
}

function extractReviewTimestampText(text: string): string | null {
  return text.match(/\b(20\d{2}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?)\b/)?.[1] || null;
}

export function parseReviewTimestamp(value: string | null): Date | null {
  if (!value) return null;
  const match = value.match(/^(20\d{2})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '00'] = match;
  const timestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - 8,
    Number(minute),
    Number(second),
  );
  return new Date(timestamp);
}

export function isReviewWithinLastHours(value: string | null, now: Date, hours: number): boolean {
  const reviewTime = parseReviewTimestamp(value);
  if (!reviewTime) return false;
  const ageMs = now.getTime() - reviewTime.getTime();
  return ageMs >= 0 && ageMs <= hours * 60 * 60 * 1000;
}

function inferReviewStars(content: string): number | null {
  const numericStars = content.match(/([1-5])\s*星/);
  if (numericStars) return parseInt(numericStars[1], 10);
  if (content.includes('很好')) return 5;
  if (content.includes('较好')) return 4;
  return null;
}

async function findButton(page: any, labels: string[]): Promise<any> {
  for (var _i = 0; _i < labels.length; _i++) {
    var btn = await page.$(`button:has-text("${labels[_i]}"), a:has-text("${labels[_i]}"), span:has-text("${labels[_i]}")`);
    if (btn) return btn;
  }
  return null;
}
