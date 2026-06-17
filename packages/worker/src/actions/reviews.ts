/**
 * 评价管理操作 — 好评回复 + 差评举报
 */
import { BrowserManager } from '../browser';
import { ReviewActionDetail } from '@pdd-inspector/core';

const REVIEW_URL = 'https://mms.pinduoduo.com/goods/evaluation/index?msfrom=mms_sidenav';

export interface ReviewActionResult {
  details: ReviewActionDetail[];
  replied: number;
  reported: number;
  skipped: number;
  failed: number;
}

export async function replyToGoodReviews(
  browser: BrowserManager,
  storeId: number,
  replyTemplate: string,
): Promise<ReviewActionResult> {
  const page = browser.getPage();
  const result: ReviewActionResult = { details: [], replied: 0, reported: 0, skipped: 0, failed: 0 };

  try {
    await browser.navigateWithRetry(REVIEW_URL);
    await page.waitForTimeout(3000);

    // 筛选好评 (4-5星)
    await filterByStars(page, [4, 5]);

    const reviews = await scrapeReviewList(page);
    console.log(`  Found ${reviews.length} good reviews to process`);

    for (const review of reviews) {
      try {
        const replyBtn = await findButton(page, ['回复', 'Reply']);
        if (!replyBtn) {
          result.skipped++;
          result.details.push({
            reviewId: review.id, reviewContent: review.content, reviewStars: review.stars,
            actionType: 'reply', actionContent: '', status: 'skipped',
          });
          continue;
        }
        await replyBtn.click();
        await page.waitForTimeout(800);

        const textarea = await page.$('textarea, [contenteditable="true"]');
        if (textarea) {
          await textarea.fill(replyTemplate);
          await page.waitForTimeout(500);
        }

        const submitBtn = await findButton(page, ['提交', '发布', '确认', 'Submit']);
        if (submitBtn) {
          await submitBtn.click();
          await page.waitForTimeout(1500);
          result.replied++;
          result.details.push({
            reviewId: review.id, reviewContent: review.content, reviewStars: review.stars,
            actionType: 'reply', actionContent: replyTemplate, status: 'success',
          });
        }
      } catch {
        result.failed++;
        result.details.push({
          reviewId: review.id, reviewContent: review.content, reviewStars: review.stars,
          actionType: 'reply', actionContent: '', status: 'failed',
        });
      }
      await page.waitForTimeout(1500 + Math.random() * 3000);
    }
    await browser.takeScreenshot(storeId, 'reviews-replied');
  } catch (err) {
    console.error(`Reply action error for ${storeId}:`, err);
  }
  return result;
}

export async function reportBadReviews(
  browser: BrowserManager,
  storeId: number,
  getReportTemplate: (review: { content: string; stars: number }) => string,
): Promise<ReviewActionResult> {
  const page = browser.getPage();
  const result: ReviewActionResult = { details: [], replied: 0, reported: 0, skipped: 0, failed: 0 };

  try {
    await browser.navigateWithRetry(REVIEW_URL);
    await page.waitForTimeout(3000);

    await filterByStars(page, [1, 2, 3]);
    const reviews = await scrapeReviewList(page);
    console.log(`  Found ${reviews.length} bad reviews to process`);

    for (const review of reviews) {
      try {
        const template = getReportTemplate(review);
        const reportBtn = await findButton(page, ['举报', 'Report']);
        if (!reportBtn) { result.skipped++; continue; }

        await reportBtn.click();
        await page.waitForTimeout(1000);

        const textarea = await page.$('textarea, [contenteditable="true"]');
        if (textarea) { await textarea.fill(template); await page.waitForTimeout(500); }

        const submitBtn = await findButton(page, ['提交', '确认举报', 'Submit']);
        if (submitBtn) {
          await submitBtn.click();
          await page.waitForTimeout(1500);
          result.reported++;
          result.details.push({
            reviewId: review.id, reviewContent: review.content, reviewStars: review.stars,
            actionType: 'report', actionContent: template, status: 'success',
          });
        }
      } catch {
        result.failed++;
      }
      await page.waitForTimeout(3000 + Math.random() * 5000);
    }
    await browser.takeScreenshot(storeId, 'reviews-reported');
  } catch (err) {
    console.error(`Report action error for ${storeId}:`, err);
  }
  return result;
}

async function filterByStars(page: any, stars: number[]): Promise<void> {
  for (const star of stars) {
    try {
      const starBtn = await page.$(`[class*="star"]:has-text("${star}"), button:has-text("${star}星")`);
      if (starBtn) await starBtn.click();
    } catch { /* ignore */ }
  }
  await page.waitForTimeout(1500);
}

async function scrapeReviewList(page: any): Promise<{ id: string; content: string; stars: number }[]> {
  return page.evaluate(function () {
    var reviews: { id: string; content: string; stars: number }[] = [];
    var items = document.querySelectorAll('[class*="review"], [class*="comment"], [class*="evaluation"], [class*="item"]');
    for (var i = 0; i < items.length; i++) {
      var text = (items[i] as HTMLElement).innerText || '';
      var starMatch = text.match(/([1-5])星/);
      var stars = starMatch ? parseInt(starMatch[1]) : 0;
      var lines = text.split('\n').filter(function (l) { return l.length > 5; });
      var content = '';
      for (var j = 0; j < lines.length; j++) {
        if (lines[j].length > 10 && lines[j].indexOf('举报') === -1 && lines[j].indexOf('回复') === -1) {
          content = lines[j]; break;
        }
      }
      var idMatch = text.match(/\d{15,}/);
      if (content && stars > 0) {
        reviews.push({ id: idMatch ? idMatch[0] : 'r-' + i, content: content, stars: stars });
      }
    }
    return reviews;
  });
}

async function findButton(page: any, labels: string[]): Promise<any> {
  for (var _i = 0; _i < labels.length; _i++) {
    var btn = await page.$(`button:has-text("${labels[_i]}"), a:has-text("${labels[_i]}"), span:has-text("${labels[_i]}")`);
    if (btn) return btn;
  }
  return null;
}
