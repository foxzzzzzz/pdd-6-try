/**
 * 评价管理操作 — 好评回复 + 差评举报
 */
import { BrowserManager } from '../browser';
import { ReviewActionDetail } from '@pdd-inspector/core';
import { ActionSafety, buildActionAudit, canSubmitAction, resolveActionSafety } from '../action-safety';

const REVIEW_URL = 'https://mms.pinduoduo.com/goods/evaluation/index?msfrom=mms_sidenav';

export interface ReviewActionResult { details: ReviewActionDetail[]; replied: number; reported: number; skipped: number; failed: number; }
interface ReviewRow { id: string; content: string; stars: number; row?: any; }
type ReportTemplateResolver = (r: { content: string; stars: number }) => string | Promise<string>;

export async function replyToGoodReviews(browser: BrowserManager, storeId: number, replyTemplate: string, safetyInput: Partial<ActionSafety> = {}): Promise<ReviewActionResult> {
  const page = browser.getPage();
  const safety = resolveActionSafety(safetyInput);
  let submittedCount = 0;
  const result: ReviewActionResult = { details: [], replied: 0, reported: 0, skipped: 0, failed: 0 };
  try {
    await browser.navigateWithRetry(REVIEW_URL); await page.waitForTimeout(3000);
    await filterByStars(page, [4, 5]);
    const reviews = (await getReviewRows(page)).filter((review) => review.stars >= 4);
    console.log(`  Found ${reviews.length} good reviews`);
    const pageScreenshot = await browser.takeScreenshot(storeId, 'reviews-reply-scan');
    await dismissBlockingModal(page);

    for (var _i = 0; _i < reviews.length; _i++) {
      var review = reviews[_i];
      try {
        if (!canSubmitAction(safety, 'reply') || (safety.maxActions != null && submittedCount >= safety.maxActions)) {
          result.skipped++;
          result.details.push({
            reviewId: review.id,
            reviewContent: review.content,
            reviewStars: review.stars,
            actionType: 'reply',
            actionContent: replyTemplate,
            ...buildActionAudit(safety, replyTemplate, { screenshotPath: pageScreenshot }),
          });
          continue;
        }
        var replyBtn = review.row ? await findButton(review.row, ['回复/互动', '回复', 'Reply']) : null;
        if (!replyBtn) { result.skipped++; result.details.push({ reviewId: review.id, reviewContent: review.content, reviewStars: review.stars, actionType: 'reply', actionContent: '', ...buildActionAudit(safety, '', { screenshotPath: pageScreenshot, errorMessage: 'Reply button not found' }) }); continue; }
        await openQuickReplyModal(page, replyBtn);
        await fillQuickReplyModal(page, replyTemplate);
        const submitBtn = await findQuickReplySubmitButton(page);
        if (submitBtn) { await submitBtn.click({ timeout: 5000 }); await page.waitForTimeout(1500); submittedCount++; const screenshotPath = await browser.takeScreenshot(storeId, 'review-reply-submitted'); result.replied++; result.details.push({ reviewId: review.id, reviewContent: review.content, reviewStars: review.stars, actionType: 'reply', actionContent: replyTemplate, ...buildActionAudit(safety, replyTemplate, { submitted: true, screenshotPath }) }); }
        else { result.failed++; result.details.push({ reviewId: review.id, reviewContent: review.content, reviewStars: review.stars, actionType: 'reply', actionContent: replyTemplate, ...buildActionAudit(safety, replyTemplate, { screenshotPath: pageScreenshot, errorMessage: 'Quick reply submit button not found' }) }); }
      } catch (err) {
        result.failed++;
        result.details.push({ reviewId: review.id, reviewContent: review.content, reviewStars: review.stars, actionType: 'reply', actionContent: replyTemplate, ...buildActionAudit(safety, replyTemplate, { screenshotPath: pageScreenshot, errorMessage: err instanceof Error ? err.message : String(err) }) });
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
  let submittedCount = 0;
  const result: ReviewActionResult = { details: [], replied: 0, reported: 0, skipped: 0, failed: 0 };
  try {
    await browser.navigateWithRetry(REVIEW_URL); await page.waitForTimeout(3000);
    await filterByStars(page, [1, 2, 3]);
    const reviews = (await getReviewRows(page)).filter((review) => review.stars <= 3);
    console.log(`  Found ${reviews.length} bad reviews`);
    const pageScreenshot = await browser.takeScreenshot(storeId, 'reviews-report-scan');

    for (var _i = 0; _i < reviews.length; _i++) {
      var review = reviews[_i];
      var template = '';
      try {
        template = await getReportTemplate(review);
        if (!canSubmitAction(safety, 'report') || (safety.maxActions != null && submittedCount >= safety.maxActions)) {
          result.skipped++;
          result.details.push({
            reviewId: review.id,
            reviewContent: review.content,
            reviewStars: review.stars,
            actionType: 'report',
            actionContent: template,
            ...buildActionAudit(safety, template, { screenshotPath: pageScreenshot }),
          });
          continue;
        }
        var reportBtn = review.row ? await findButton(review.row, ['举报', 'Report']) : null;
        if (!reportBtn) { result.skipped++; result.details.push({ reviewId: review.id, reviewContent: review.content, reviewStars: review.stars, actionType: 'report', actionContent: template, ...buildActionAudit(safety, template, { screenshotPath: pageScreenshot, errorMessage: 'Report button not found' }) }); continue; }
        await reportBtn.scrollIntoViewIfNeeded().catch(() => undefined);
        await reportBtn.click({ timeout: 5000 }); await page.waitForTimeout(1000);
        var textarea = await page.$('textarea, [contenteditable="true"]');
        if (textarea) { await textarea.fill(template); await page.waitForTimeout(500); }
        var submitBtn = await findButton(page, ['提交', '确认举报', 'Submit']);
        if (submitBtn) { await submitBtn.click(); await page.waitForTimeout(1500); submittedCount++; const screenshotPath = await browser.takeScreenshot(storeId, 'review-report-submitted'); result.reported++; result.details.push({ reviewId: review.id, reviewContent: review.content, reviewStars: review.stars, actionType: 'report', actionContent: template, ...buildActionAudit(safety, template, { submitted: true, screenshotPath }) }); }
        else { result.failed++; result.details.push({ reviewId: review.id, reviewContent: review.content, reviewStars: review.stars, actionType: 'report', actionContent: template, ...buildActionAudit(safety, template, { screenshotPath: pageScreenshot, errorMessage: 'Submit button not found' }) }); }
      } catch (err) {
        result.failed++;
        result.details.push({ reviewId: review.id, reviewContent: review.content, reviewStars: review.stars, actionType: 'report', actionContent: template, ...buildActionAudit(safety, template, { screenshotPath: pageScreenshot, errorMessage: err instanceof Error ? err.message : String(err) }) });
      }
      await page.waitForTimeout(3000 + Math.random() * 5000);
    }
    await browser.takeScreenshot(storeId, 'reviews-reported');
  } catch (err) { console.error(`Report error for ${storeId}:`, err); }
  return result;
}

async function filterByStars(page: any, stars: number[]): Promise<void> {
  for (var _i = 0; _i < stars.length; _i++) {
    try { var btn = await page.$(`[class*="star"]:has-text("${stars[_i]}"), button:has-text("${stars[_i]}星")`); if (btn) await btn.click(); } catch { /* */ }
  }
  await page.waitForTimeout(1500);
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

async function openQuickReplyModal(page: any, replyBtn: any): Promise<void> {
  await dismissBlockingModal(page);
  await replyBtn.scrollIntoViewIfNeeded().catch(() => undefined);
  try {
    await replyBtn.click({ timeout: 5000, force: true });
  } catch (err) {
    if (await hasQuickReplyModal(page)) return;
    throw err;
  }
  await waitForQuickReplyModal(page);
}

async function fillQuickReplyModal(page: any, content: string): Promise<void> {
  await waitForQuickReplyModal(page);
  const textarea = await page.$('[data-testid="beast-core-modal"] textarea, [class*="MDL_modal"] textarea, textarea, [contenteditable="true"]');
  if (!textarea) throw new Error('Quick reply textarea not found');
  await textarea.fill(content);
  await page.waitForTimeout(300);
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

async function collectReviewRows(rowHandles: any[]): Promise<ReviewRow[]> {
  const reviews: ReviewRow[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < rowHandles.length; i++) {
    const text = await rowHandles[i].innerText().catch(() => '');
    const review = parseReviewRowText(text, `r-${i}`) || parseReviewBodyRowText(text, `r-${i}`);
    if (!review) continue;
    const key = `${review.id}|${review.content}|${review.stars}`;
    if (seen.has(key)) continue;
    seen.add(key);
    reviews.push({ ...review, row: rowHandles[i] });
  }
  return reviews;
}

export function parseReviewRowText(text: string, fallbackId = 'r-0'): ReviewRow | null {
  if (!text.includes('用户评价分')) return null;
  const scoreLine = text.split(/\r?\n/).find((line) => line.includes('用户评价分')) || text;
  const starChars = scoreLine.match(/[★]+/)?.[0] || '';
  const numericStars = scoreLine.match(/([1-5])\s*星/);
  const stars = starChars.length > 0 ? Math.min(starChars.length, 5) : numericStars ? parseInt(numericStars[1], 10) : 0;
  if (stars < 1 || stars > 5) return null;

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const content = lines.find((line) => {
    if (line.includes('用户评价分')) return false;
    if (/^\d{4}-\d{2}-\d{2}/.test(line)) return false;
    if (/^(查看订单|举报|回复\/互动|回复|订单编号|买家昵称|ID:|被点赞数|互动数)/.test(line)) return false;
    return line.length >= 4;
  });
  if (!content) return null;

  const orderIdMatch = text.match(/订单编号[:：]\s*([0-9-]+)/);
  const idMatch = orderIdMatch?.[1].replace(/\D/g, '') || text.match(/\d{15,}/)?.[0];
  return { id: idMatch || fallbackId, content, stars };
}

export function parseReviewBodyRowText(text: string, fallbackId = 'r-0'): ReviewRow | null {
  if (!text.includes('订单编号') || !text.includes('回复/互动')) return null;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const content = lines.find((line) => {
    if (/^\d{4}-\d{2}-\d{2}/.test(line)) return false;
    if (/^(查看订单|举报|回复\/互动|回复|订单编号|买家昵称|ID:)/.test(line)) return false;
    return line.length >= 4;
  });
  if (!content) return null;

  const stars = inferReviewStars(content);
  if (stars == null) return null;
  const orderIdMatch = text.match(/订单编号[:：]\s*([0-9-]+)/);
  const idMatch = orderIdMatch?.[1].replace(/\D/g, '') || text.match(/\d{15,}/)?.[0];
  return { id: idMatch || fallbackId, content, stars };
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
