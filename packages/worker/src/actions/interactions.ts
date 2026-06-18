/**
 * 互动动态处理 — 识别负面动态并隐藏
 */
import { BrowserManager } from '../browser';
import { InteractionActionDetail } from '@pdd-inspector/core';
import { ActionSafety, buildActionAudit, canSubmitAction, resolveActionSafety } from '../action-safety';

const INTERACTION_URL = 'https://mms.pinduoduo.com/mall-feed/home?msfrom=mms_sidenav';

export interface InteractionActionResult { details: InteractionActionDetail[]; hidden: number; ignored: number; skipped: number; }

export async function handleInteractions(browser: BrowserManager, storeId: number, judgeFunc: (c: string) => { shouldHide: boolean; reason: string }, safetyInput: Partial<ActionSafety> = {}): Promise<InteractionActionResult> {
  const page = browser.getPage();
  const safety = resolveActionSafety(safetyInput);
  let submittedCount = 0;
  const result: InteractionActionResult = { details: [], hidden: 0, ignored: 0, skipped: 0 };
  try {
    await browser.navigateWithRetry(INTERACTION_URL); await page.waitForTimeout(3000);
    const posts = await scrapeInteractionList(page);
    console.log(`  Found ${posts.length} interaction posts`);
    const pageScreenshot = await browser.takeScreenshot(storeId, 'interactions-scan');

    for (var _i = 0; _i < posts.length; _i++) {
      var post = posts[_i];
      try {
        var judgment = judgeFunc(post.content);
        result.details.push({
          interactionId: post.id,
          contentSummary: post.content.substring(0, 100),
          aiJudgment: judgment.shouldHide ? 'negative' : 'neutral',
          action: judgment.shouldHide ? 'hide' : 'ignore',
          status: judgment.shouldHide ? 'pending' : 'success',
          actionMode: safety.mode,
          screenshotPath: pageScreenshot,
        });
        if (judgment.shouldHide) {
          if (!canSubmitAction(safety, 'hide') || (safety.maxActions != null && submittedCount >= safety.maxActions)) {
            result.skipped++;
            Object.assign(result.details[result.details.length - 1], buildActionAudit(safety, judgment.reason, { screenshotPath: pageScreenshot }));
            continue;
          }
          var hideBtn = await findButton(page, ['删除', '隐藏', '下架', 'Delete', 'Hide']);
          if (hideBtn) {
            await hideBtn.click(); await page.waitForTimeout(800);
            var confirmBtn = await findButton(page, ['确认', '确定', 'Yes', 'Confirm']);
            if (confirmBtn) { await confirmBtn.click(); await page.waitForTimeout(1000); }
            const screenshotPath = await browser.takeScreenshot(storeId, 'interaction-hide-submitted');
            submittedCount++;
            result.hidden++;
            Object.assign(result.details[result.details.length - 1], buildActionAudit(safety, judgment.reason, { submitted: true, screenshotPath }));
          } else {
            result.skipped++;
            Object.assign(result.details[result.details.length - 1], buildActionAudit(safety, judgment.reason, { screenshotPath: pageScreenshot, errorMessage: 'Hide button not found' }));
          }
        } else { result.ignored++; result.details[result.details.length - 1].status = 'success'; }
      } catch (err) {
        result.skipped++;
        result.details.push({
          interactionId: post.id,
          contentSummary: post.content.substring(0, 100),
          aiJudgment: 'error',
          action: 'ignore',
          ...buildActionAudit(safety, '', { screenshotPath: pageScreenshot, errorMessage: err instanceof Error ? err.message : String(err) }),
        });
      }
      await page.waitForTimeout(500 + Math.random() * 1000);
    }
    await browser.takeScreenshot(storeId, 'interactions');
  } catch (err) { console.error(`Interaction error for ${storeId}:`, err); }
  return result;
}

async function scrapeInteractionList(page: any): Promise<{ id: string; content: string }[]> {
  return JSON.parse(await page.evaluate(`(function () {
    var posts = [];
    var main = document.querySelector('main, [class*="content-wrap"], [class*="page-content"]');
    var container = main || document.body;
    var rows = container.querySelectorAll('tr');
    for (var i = 0; i < rows.length; i++) {
      var text = rows[i].innerText ? rows[i].innerText.trim() : '';
      if (text.length > 30 && text.indexOf('曝光量') === -1 && text.indexOf('动态类型') === -1 && text.indexOf('一键发布') === -1 && text.indexOf('TEMU') === -1 && text.indexOf('签约入驻') === -1) {
        var idMatch = text.match(/\\d{10,}/);
        posts.push({ id: idMatch ? idMatch[0] : 'post-'+Date.now()+'-'+i, content: text.substring(0, 500) });
      }
    }
    return JSON.stringify(posts);
  })()`));
}

async function findButton(page: any, labels: string[]): Promise<any> {
  for (var _i = 0; _i < labels.length; _i++) {
    var btn = await page.$(`button:has-text("${labels[_i]}"), a:has-text("${labels[_i]}"), span:has-text("${labels[_i]}")`);
    if (btn) return btn;
  }
  return null;
}
