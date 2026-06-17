/**
 * 评价管理操作 — 好评回复 + 差评举报
 */
import { BrowserManager } from '../browser';
import { ReviewActionDetail } from '@pdd-inspector/core';

const REVIEW_URL = 'https://mms.pinduoduo.com/goods/evaluation/index?msfrom=mms_sidenav';

export interface ReviewActionResult { details: ReviewActionDetail[]; replied: number; reported: number; skipped: number; failed: number; }

export async function replyToGoodReviews(browser: BrowserManager, storeId: number, replyTemplate: string): Promise<ReviewActionResult> {
  const page = browser.getPage();
  const result: ReviewActionResult = { details: [], replied: 0, reported: 0, skipped: 0, failed: 0 };
  try {
    await browser.navigateWithRetry(REVIEW_URL); await page.waitForTimeout(3000);
    await filterByStars(page, [4, 5]);
    const reviews = await scrapeReviewList(page);
    console.log(`  Found ${reviews.length} good reviews`);

    for (var _i = 0; _i < reviews.length; _i++) {
      var review = reviews[_i];
      try {
        var replyBtn = await findButton(page, ['回复', 'Reply']);
        if (!replyBtn) { result.skipped++; result.details.push({ reviewId: review.id, reviewContent: review.content, reviewStars: review.stars, actionType: 'reply', actionContent: '', status: 'skipped' }); continue; }
        await replyBtn.click(); await page.waitForTimeout(800);
        var textarea = await page.$('textarea, [contenteditable="true"]');
        if (textarea) { await textarea.fill(replyTemplate); await page.waitForTimeout(500); }
        var submitBtn = await findButton(page, ['提交', '发布', '确认', 'Submit']);
        if (submitBtn) { await submitBtn.click(); await page.waitForTimeout(1500); result.replied++; result.details.push({ reviewId: review.id, reviewContent: review.content, reviewStars: review.stars, actionType: 'reply', actionContent: replyTemplate, status: 'success' }); }
      } catch { result.failed++; }
      await page.waitForTimeout(1500 + Math.random() * 3000);
    }
    await browser.takeScreenshot(storeId, 'reviews-replied');
  } catch (err) { console.error(`Reply error for ${storeId}:`, err); }
  return result;
}

export async function reportBadReviews(browser: BrowserManager, storeId: number, getReportTemplate: (r: { content: string; stars: number }) => string): Promise<ReviewActionResult> {
  const page = browser.getPage();
  const result: ReviewActionResult = { details: [], replied: 0, reported: 0, skipped: 0, failed: 0 };
  try {
    await browser.navigateWithRetry(REVIEW_URL); await page.waitForTimeout(3000);
    await filterByStars(page, [1, 2, 3]);
    const reviews = await scrapeReviewList(page);
    console.log(`  Found ${reviews.length} bad reviews`);

    for (var _i = 0; _i < reviews.length; _i++) {
      var review = reviews[_i];
      try {
        var template = getReportTemplate(review);
        var reportBtn = await findButton(page, ['举报', 'Report']);
        if (!reportBtn) { result.skipped++; continue; }
        await reportBtn.click(); await page.waitForTimeout(1000);
        var textarea = await page.$('textarea, [contenteditable="true"]');
        if (textarea) { await textarea.fill(template); await page.waitForTimeout(500); }
        var submitBtn = await findButton(page, ['提交', '确认举报', 'Submit']);
        if (submitBtn) { await submitBtn.click(); await page.waitForTimeout(1500); result.reported++; result.details.push({ reviewId: review.id, reviewContent: review.content, reviewStars: review.stars, actionType: 'report', actionContent: template, status: 'success' }); }
      } catch { result.failed++; }
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

async function scrapeReviewList(page: any): Promise<{ id: string; content: string; stars: number }[]> {
  return JSON.parse(await page.evaluate(`(function () {
    var reviews = [];
    var items = document.querySelectorAll('[class*="review"], [class*="comment"], [class*="evaluation"], [class*="item"]');
    for (var i = 0; i < items.length; i++) {
      var text = items[i].innerText || '';
      var starMatch = text.match(/([1-5])星/);
      var stars = starMatch ? parseInt(starMatch[1]) : 0;
      var lines = text.split('\\n');
      var content = '';
      for (var j = 0; j < lines.length; j++) {
        if (lines[j].length > 10 && lines[j].indexOf('举报') === -1 && lines[j].indexOf('回复') === -1 && lines[j].indexOf('评价') === -1) { content = lines[j]; break; }
      }
      var idMatch = text.match(/\\d{15,}/);
      if (content && stars > 0) reviews.push({ id: idMatch ? idMatch[0] : 'r-'+i, content: content, stars: stars });
    }
    return JSON.stringify(reviews);
  })()`));
}

async function findButton(page: any, labels: string[]): Promise<any> {
  for (var _i = 0; _i < labels.length; _i++) {
    var btn = await page.$(`button:has-text("${labels[_i]}"), a:has-text("${labels[_i]}"), span:has-text("${labels[_i]}")`);
    if (btn) return btn;
  }
  return null;
}
