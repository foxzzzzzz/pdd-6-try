/**
 * 评价管理操作 — 好评回复 + 差评举报
 *
 * URL: /goods/evaluation/index
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

/**
 * 处理好评 (4-5星): 自动回复
 */
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

    // 遍历评价列表
    const reviews = await scrapeReviewList(page);
    console.log(`  Found ${reviews.length} good reviews to process`);

    for (const review of reviews) {
      try {
        // 点击回复按钮
        const replyBtn = await findButton(page, ['回复', 'Reply']);
        if (!replyBtn) {
          result.skipped++;
          result.details.push({
            reviewId: review.id || '',
            reviewContent: review.content,
            reviewStars: review.stars,
            actionType: 'reply',
            actionContent: '',
            status: 'skipped',
          });
          continue;
        }

        await replyBtn.click();
        await page.waitForTimeout(800);

        // 填写回复内容
        const textarea = await page.$('textarea, [contenteditable="true"], [class*="editor"]');
        if (textarea) {
          await textarea.fill(replyTemplate);
          await page.waitForTimeout(500);
        }

        // 提交
        const submitBtn = await findButton(page, ['提交', '发布', '确认', 'Submit']);
        if (submitBtn) {
          await submitBtn.click();
          await page.waitForTimeout(1500);
          result.replied++;
          result.details.push({
            reviewId: review.id || '',
            reviewContent: review.content,
            reviewStars: review.stars,
            actionType: 'reply',
            actionContent: replyTemplate,
            status: 'success',
          });
        }
      } catch (err) {
        result.failed++;
        result.details.push({
          reviewId: review.id || '',
          reviewContent: review.content,
          reviewStars: review.stars,
          actionType: 'reply',
          actionContent: '',
          status: 'failed',
        });
      }

      // 操作间隔（防风控）
      await page.waitForTimeout(1500 + Math.random() * 3000);
    }

    await browser.takeScreenshot(storeId, 'reviews-replied');
  } catch (err) {
    console.error(`Reply action error for ${storeId}:`, err);
  }

  return result;
}

/**
 * 处理差评 (1-3星): 按话术举报
 */
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

    // 筛选差评 (1-3星)
    await filterByStars(page, [1, 2, 3]);

    const reviews = await scrapeReviewList(page);
    console.log(`  Found ${reviews.length} bad reviews to process`);

    for (const review of reviews) {
      try {
        const template = getReportTemplate(review);

        // 点击举报按钮
        const reportBtn = await findButton(page, ['举报', 'Report']);
        if (!reportBtn) {
          result.skipped++;
          continue;
        }

        await reportBtn.click();
        await page.waitForTimeout(1000);

        // 填写举报内容
        const textarea = await page.$('textarea, [contenteditable="true"]');
        if (textarea) {
          await textarea.fill(template);
          await page.waitForTimeout(500);
        }

        // 提交举报
        const submitBtn = await findButton(page, ['提交', '确认举报', 'Submit']);
        if (submitBtn) {
          await submitBtn.click();
          await page.waitForTimeout(1500);
          result.reported++;
          result.details.push({
            reviewId: review.id || '',
            reviewContent: review.content,
            reviewStars: review.stars,
            actionType: 'report',
            actionContent: template,
            status: 'success',
          });
        }
      } catch (err) {
        result.failed++;
        result.details.push({
          reviewId: review.id || '',
          reviewContent: review.content,
          reviewStars: review.stars,
          actionType: 'report',
          actionContent: '',
          status: 'failed',
        });
      }

      // 举报间隔更长（防风控）
      await page.waitForTimeout(3000 + Math.random() * 5000);
    }

    await browser.takeScreenshot(storeId, 'reviews-reported');
  } catch (err) {
    console.error(`Report action error for ${storeId}:`, err);
  }

  return result;
}

// ========== Helpers ==========

/** 按星级筛选评价 */
async function filterByStars(page: any, stars: number[]): Promise<void> {
  // Try clicking star filter buttons
  for (const star of stars) {
    try {
      const starBtn = await page.$(`[class*="star"]:has-text("${star}"), button:has-text("${star}星")`);
      if (starBtn) await starBtn.click();
    } catch { /* ignore */ }
  }
  await page.waitForTimeout(1500);
}

/** 抓取评价列表 */
async function scrapeReviewList(page: any): Promise<{ id: string; content: string; stars: number }[]> {
  return page.evaluate(() => {
    const reviews: { id: string; content: string; stars: number }[] = [];
    // Find review items — look for star patterns + text content
    const items = document.querySelectorAll('[class*="review"], [class*="comment"], [class*="evaluation"], [class*="item"]');
    items.forEach((item) => {
      const text = (item as HTMLElement).innerText || '';
      // Extract star rating
      const starMatch = text.match(/([1-5])星|评价.*?(\d)/);
      const stars = starMatch ? parseInt(starMatch[1] || starMatch[2]) : 0;
      // Extract review content (longest text segment)
      const lines = text.split('\n').filter((l) => l.length > 5);
      const content = lines.find((l) => l.length > 10 && !l.includes('举报') && !l.includes('回复')) || '';
      // Extract review ID
      const idMatch = text.match(/\d{15,}/);
      const id = idMatch ? idMatch[0] : '';

      if (content && stars > 0) {
        reviews.push({ id, content, stars });
      }
    });
    return reviews;
  });
}

/** 查找页面按钮 */
async function findButton(page: any, labels: string[]): Promise<any> {
  for (const label of labels) {
    const btn = await page.$(
      `button:has-text("${label}"), a:has-text("${label}"), [class*="btn"]:has-text("${label}"), span:has-text("${label}")`,
    );
    if (btn) return btn;
  }
  return null;
}
