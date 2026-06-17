/**
 * 互动动态处理 — 识别负面动态并隐藏
 *
 * URL: /mall-feed/home
 */
import { BrowserManager } from '../browser';
import { InteractionActionDetail } from '@pdd-inspector/core';

const INTERACTION_URL = 'https://mms.pinduoduo.com/mall-feed/home?msfrom=mms_sidenav';

export interface InteractionActionResult {
  details: InteractionActionDetail[];
  hidden: number;
  ignored: number;
  skipped: number;
}

/**
 * 处理互动动态
 * @param judgeFunc 判断函数：返回 true 表示需要隐藏
 */
export async function handleInteractions(
  browser: BrowserManager,
  storeId: number,
  judgeFunc: (content: string) => { shouldHide: boolean; reason: string },
): Promise<InteractionActionResult> {
  const page = browser.getPage();
  const result: InteractionActionResult = { details: [], hidden: 0, ignored: 0, skipped: 0 };

  try {
    await browser.navigateWithRetry(INTERACTION_URL);
    await page.waitForTimeout(3000);

    // 抓取动态列表
    const posts = await scrapeInteractionList(page);
    console.log(`  Found ${posts.length} interaction posts`);

    for (const post of posts) {
      try {
        const judgment = judgeFunc(post.content);

        result.details.push({
          interactionId: post.id,
          contentSummary: post.content.substring(0, 100),
          aiJudgment: judgment.shouldHide ? 'negative' : 'neutral',
          action: judgment.shouldHide ? 'hide' : 'ignore',
          status: 'pending',
        });

        if (judgment.shouldHide) {
          // 查找删除/隐藏按钮
          const hideBtn = await findButton(page, ['删除', '隐藏', '下架', 'Delete', 'Hide']);
          if (hideBtn) {
            await hideBtn.click();
            await page.waitForTimeout(800);

            // 确认对话框
            const confirmBtn = await findButton(page, ['确认', '确定', 'Yes', 'Confirm']);
            if (confirmBtn) {
              await confirmBtn.click();
              await page.waitForTimeout(1000);
            }

            result.hidden++;
            const detail = result.details[result.details.length - 1];
            detail.status = 'success';
          } else {
            result.skipped++;
          }
        } else {
          result.ignored++;
          result.details[result.details.length - 1].status = 'success';
        }
      } catch (err) {
        result.skipped++;
        if (result.details.length > 0) {
          result.details[result.details.length - 1].status = 'failed';
        }
      }

      await page.waitForTimeout(500 + Math.random() * 1000);
    }

    await browser.takeScreenshot(storeId, 'interactions');
  } catch (err) {
    console.error(`Interaction error for ${storeId}:`, err);
  }

  return result;
}

/** 抓取互动动态列表 */
async function scrapeInteractionList(page: any): Promise<{ id: string; content: string }[]> {
  return page.evaluate(() => {
    const posts: { id: string; content: string }[] = [];
    // 种草动态页面的内容结构
    const rows = document.querySelectorAll('tr, [class*="row"], [class*="item"], [class*="card"]');
    rows.forEach((row) => {
      const text = (row as HTMLElement).innerText?.trim() || '';
      if (text.length > 20 && !text.includes('曝光量') && !text.includes('动态类型')) {
        // Extract a content identifier
        const idMatch = text.match(/\d{10,}/);
        posts.push({
          id: idMatch ? idMatch[0] : `post-${Date.now()}-${Math.random()}`,
          content: text.substring(0, 500),
        });
      }
    });
    return posts;
  });
}

async function findButton(page: any, labels: string[]): Promise<any> {
  for (const label of labels) {
    const btn = await page.$(
      `button:has-text("${label}"), a:has-text("${label}"), span:has-text("${label}")`,
    );
    if (btn) return btn;
  }
  return null;
}
