# Chrome launch risk analysis

## Purpose

This document tracks the investigation into why PDD merchant backend triggers a slider/puzzle security verification when Chrome is launched by the patrol automation, while manual Chrome on the same machine, same store, and same Chrome installation does not trigger it.

This is a blocking production-readiness issue. If PDD keeps showing the slider verification on automated patrol startup, the whole automated patrol workflow is not reliable enough to use.

## Current goal

Find and remove the browser-startup differences that cause PDD to classify the automated patrol session as a higher-risk browser environment, without breaking the Redis/BullMQ worker architecture or the existing collector/parser stability.

The operational target is strict: automation-launched Chrome must stop triggering PDD slider/puzzle verification during patrol startup. If this cannot be achieved, automated patrol is not production-usable.

## Current status

As of 2026-07-02, `BROWSER_LAUNCH_MODE=external-cdp` with the manually initialized experiment profile is the first path that has completed a patrol without either a visible PDD slider verification or a local false-positive pause:

- PDD no longer showed a visible slider verification during the patrol startup/home-page checks.
- Saved diagnostics showed `navigator.webdriver=false`, `navigator.languages=["zh-CN","zh"]`, and a minimal external Chrome command line using `--remote-debugging-port`, `--user-data-dir`, and `about:blank`.
- After tightening screenshot fallback detection, the next patrol completed normally: no platform slider verification appeared, no `screenshot-modal-overlay` false positive paused the run, and patrol data collection finished.
- Current working conclusion: the strongest practical fix is external-CDP Chrome launch plus the initialized trusted profile; the strongest suspected trigger in the old path remains Playwright's normal launch/control signature, especially the automation-exposed fingerprint difference around `navigator.webdriver`.

This is a successful single-store validation, not yet a long-run guarantee. Next confidence step: repeat the same external-CDP/profile setup across several patrols and, if possible, one additional store/operator profile.

The 2026-07-02 false positive happened on:

```text
https://mms.pinduoduo.com/sycm/goods_quality/pilot_mall
```

The saved screenshots:

```text
D:\try\pdd-6\packages\worker\data\screenshots\7\security-challenge-navigation-to-https-mms.pinduoduo.com-sycm-goods_quality-pilot_mall-1782948228117.png
D:\try\pdd-6\packages\worker\data\screenshots\7\security-challenge-store-health-collection-1782948229231.png
```

were normal service-data pages, not real slider dialogs. The screenshot fallback was tightened so these two real false-positive PNGs now classify as normal pages while the synthetic centered, off-center, and wide-login slider samples still classify as security challenges.

## Confirmed context

- Repository: `D:\try\pdd-6`
- Browser startup source of truth: `packages/worker/src/browser.ts`
- Normal inspection and login-bind flows go through `BrowserManager.openContext()`.
- Operator/store sessions may use `chromium.launchPersistentContext()` with a persistent profile directory.
- Current patrol is intended to run through Redis/BullMQ worker flow, not a direct shortcut path.

## Confirmed command-line comparison

Captured on 2026-06-30 during a side-by-side comparison of manual Chrome and automation-launched Chrome.

### Manual Chrome

Root process:

```text
PID: 16720
Parent: explorer.exe
CommandLine: "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

Default Chrome profile observed from crashpad child process:

```text
--user-data-dir=C:\Users\34506\AppData\Local\Google\Chrome\User Data
```

### Automation-launched Chrome

Root process:

```text
PID: 23344
Parent: node.exe
Parent command: "D:\Program Files\nodejs\node.exe" ... tsx ... src/index.ts
CommandLine: "C:\Program Files\Google\Chrome\Application\chrome.exe" ... --user-data-dir=D:\try\pdd-6\packages\worker\data\browser-profiles\1_store-7 --remote-debugging-pipe about:blank
```

Key automation-only flags observed:

```text
--disable-field-trial-config
--disable-background-networking
--disable-background-timer-throttling
--disable-backgrounding-occluded-windows
--disable-back-forward-cache
--disable-breakpad
--disable-client-side-phishing-detection
--disable-component-extensions-with-background-pages
--disable-component-update
--disable-default-apps
--disable-dev-shm-usage
--disable-extensions
--disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument,OptimizationHints,msForceBrowserSignIn,msEdgeUpdateLaunchServicesPreferredVersion
--enable-features=CDPScreenshotNewSurface
--disable-hang-monitor
--disable-ipc-flooding-protection
--disable-popup-blocking
--disable-prompt-on-repost
--disable-renderer-backgrounding
--force-color-profile=srgb
--metrics-recording-only
--no-first-run
--password-store=basic
--use-mock-keychain
--no-service-autorun
--export-tagged-pdf
--disable-search-engine-choice-screen
--unsafely-disable-devtools-self-xss-warnings
--disable-infobars
--disable-sync
--enable-unsafe-swiftshader
--user-data-dir=D:\try\pdd-6\packages\worker\data\browser-profiles\1_store-7
--remote-debugging-pipe
about:blank
```

Flags already confirmed absent from the automation launch after recent fixes:

```text
--window-size=1920,1080
--no-sandbox
--disable-setuid-sandbox
```

## Current hypotheses and priority

### Priority 1: automation-exposed page fingerprint

The same PDD page shows a high-risk JavaScript fingerprint difference between automation-launched Chrome and manually launched Chrome.

Most important:

```json
{
  "manual.webdriver": false,
  "automation.webdriver": true
}
```

This is the strongest currently observed signal. PDD can directly see that the page is under browser automation control.

### Priority 2: viewport/screen/window mismatch

Automation currently uses a fixed Playwright viewport while the visible Chrome window is maximized on a scaled Windows desktop. This creates an unnatural page geometry:

```json
{
  "automation.screen": "1920x1080",
  "automation.inner": "1920x1080",
  "automation.outer": "1536x912",
  "manual.screen": "1536x960",
  "manual.inner": "1227x1032",
  "manual.outer": "1536x912"
}
```

The automation page can report an inner viewport larger than the browser outer window. This is a strong browser-fingerprint inconsistency and may be enough to increase risk even if collectors still parse correctly.

### Priority 3: Playwright launch signature

Automation Chrome is launched by Playwright and includes `--remote-debugging-pipe` plus many `--disable-*` flags. PDD may use these as automation-risk signals.

The app-level runtime options now show:

```json
{
  "args": [],
  "headless": false,
  "channel": "chrome",
  "ignoreDefaultArgs": [
    "--no-sandbox",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--password-store=basic",
    "--use-mock-keychain"
  ]
}
```

Experiment D1 now asks Playwright to stop adding a small group of nonessential default launch arguments. `--remote-debugging-pipe` is intentionally still present because Playwright needs a connection channel to control the visible Chrome window.

The runtime JSON only proves what the project asks Playwright to ignore. Each D run still needs real Chrome process command-line verification to confirm which flags actually disappeared.

### Priority 4: language list mismatch

Manual Chrome reports:

```json
["zh-CN", "zh"]
```

Automation Chrome reports:

```json
["zh-CN"]
```

This is lower priority than `webdriver` and geometry, but it is easy to align later.

### Priority 5: profile trust-state difference

Manual Chrome uses the default user profile:

```text
C:\Users\34506\AppData\Local\Google\Chrome\User Data
```

Automation Chrome uses a project-scoped operator/store profile:

```text
D:\try\pdd-6\packages\worker\data\browser-profiles\1_store-7
```

PDD may treat this as a different browser environment even on the same machine and same Chrome installation. Missing or different cookies, IndexedDB, localStorage, cached risk/trust state, history, extensions, or device-binding artifacts may trigger slider verification.

This remains plausible, but the same-page JS fingerprint differences are now stronger evidence than profile alone.

### Priority 6: navigation behavior

Automation opens pages through direct URL navigation and patrol sequence timing. Manual usage normally starts from an already trusted interactive session and menu navigation. The first page or subsequent direct module navigation may increase risk.

The 2026-07-01 screenshot shows the verification on `https://mms.pinduoduo.com/home/`, so direct deep-link navigation is not required for the initial trigger. This makes startup/profile/Playwright-signature differences more likely than deep-link navigation for the first popup.
## Evidence already collected

### Manual Chrome page fingerprint baseline

User collected this in manually opened full-screen Chrome:

```json
{
  "href": "https://mms.pinduoduo.com/goods/evaluation/index?msfrom=mms_sidenav",
  "webdriver": false,
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  "platform": "Win32",
  "language": "zh-CN",
  "languages": ["zh-CN", "zh"],
  "timezone": "Asia/Shanghai",
  "screen": {
    "width": 1536,
    "height": 960,
    "availWidth": 1536,
    "availHeight": 912,
    "colorDepth": 32,
    "pixelDepth": 32
  },
  "window": {
    "innerWidth": 1227,
    "innerHeight": 1032,
    "outerWidth": 1536,
    "outerHeight": 912,
    "devicePixelRatio": 1
  }
}
```

This is a manual baseline, not an automation anomaly by itself.

### Same-page Step 2 fingerprint comparison

Status: completed.

Both manual and automation samples were collected on:

```text
https://mms.pinduoduo.com/sycm/goods_quality/pilot_mall
```

Automation-launched Chrome:

```json
{
  "webdriver": true,
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  "platform": "Win32",
  "language": "zh-CN",
  "languages": ["zh-CN"],
  "timezone": "Asia/Shanghai",
  "screen": {
    "width": 1920,
    "height": 1080,
    "availWidth": 1920,
    "availHeight": 1080,
    "colorDepth": 32,
    "pixelDepth": 32
  },
  "window": {
    "innerWidth": 1920,
    "innerHeight": 1080,
    "outerWidth": 1536,
    "outerHeight": 912,
    "devicePixelRatio": 1.0000000149011612,
    "visualViewport": {
      "width": 1904.800048828125,
      "height": 1080,
      "scale": 1
    }
  }
}
```

Manually launched Chrome:

```json
{
  "webdriver": false,
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  "platform": "Win32",
  "language": "zh-CN",
  "languages": ["zh-CN", "zh"],
  "timezone": "Asia/Shanghai",
  "screen": {
    "width": 1536,
    "height": 960,
    "availWidth": 1536,
    "availHeight": 912,
    "colorDepth": 32,
    "pixelDepth": 32
  },
  "window": {
    "innerWidth": 1227,
    "innerHeight": 1032,
    "outerWidth": 1536,
    "outerHeight": 912,
    "devicePixelRatio": 1,
    "visualViewport": {
      "width": 1208,
      "height": 1013,
      "scale": 1
    }
  }
}
```

Interpretation:

- The same-page comparison confirms `navigator.webdriver` differs.
- The same-page comparison confirms automation geometry is inconsistent: `innerWidth=1920` while `outerWidth=1536`.
- The same-page comparison confirms language-list mismatch.
- UserAgent, platform, language, and timezone are already aligned.

### Automated Chrome security verification screenshots

User-provided screenshot from the 2026-07-01 patrol:

```text
C:/Users/34506/Documents/xwechat_files/wxid_8lrstj21wh8o22_d0b3/temp/RWTemp/2026-07/9e20f478899dc29eb19741386f9343c8/040f61da970b92f66e0a87b9610ffeb2.png
```

Observed page:

```text
https://mms.pinduoduo.com/home/
```

Observation:

- The visible Chrome window is automation-launched Chrome on the PDD merchant backend homepage.
- The page is covered by a gray dim overlay.
- A centered puzzle/slider verification dialog is visible.
- Dialog text: `璇峰悜鍙虫粦鍧楀畬鎴愭嫾鍥綻.
- This proves the challenge can appear immediately on the backend home page, before the patrol collector reaches a deeper module URL.

Known local screenshot candidates from previous patrol attempts:

```text
packages/worker/data/screenshots/7/metrics-1782833492453.png
```

This screenshot captured a centered image/slider verification dialog over the PDD service-data page.

Later screenshots such as `metrics-1782834017556.png` and `metrics-1782834426273.png` showed normal service-data pages and did not capture the popup.

Automation-side mitigation now captures the popup:

```text
D:\try\pdd-6\packages\worker\data\screenshots\7\security-challenge-startup-home-1782882092521.png
D:\try\pdd-6\packages\worker\data\screenshots\7\security-challenge-startup-home-1782882092521.json
```

The successful detection signal was:

```text
phase=startup home
url=https://mms.pinduoduo.com/home/
signals=["screenshot-modal-overlay"]
```


### Automated Chrome DOM diagnostic data

The first pasted DOM diagnostic did not capture the popup. It was collected on:

```text
https://mms.pinduoduo.com/home/
```

The captured DOM text and candidate list showed the normal merchant backend homepage/menu, not the slider verification dialog.

Second pasted diagnostic from the 2026-07-01 patrol:

```text
C:\Users\34506\.codex\attachments\7676362f-93cd-4918-8062-5d4aebd939a3\pasted-text.txt
```

Observed result:

- `href` is still `https://mms.pinduoduo.com/home/`.
- The visible screenshot shows the slider/puzzle verification dialog at the same page.
- The pasted diagnostic output mostly contains normal merchant-backend text, menu entries, header nodes, carousel/banner nodes, and homepage cards.
- The diagnostic candidates do not expose a clear captcha/verify/slider/puzzle dialog node.

Interpretation:

- The popup is visually present but not represented in the diagnostic output we captured.
- Current automation-side DOM detection can miss this specific challenge if it only inspects the main document DOM and the existing candidate filters.
- The next diagnostic should capture both a Playwright screenshot and a broader page/frame/shadow/iframe dump at the same instant, or add a screenshot-based fail-safe around startup.

## Open evidence needed

### Step 1 command-line comparison

Status: completed. Manual and automation Chrome command lines, parent processes, and profile paths are recorded above.

### Step 2 fingerprint comparison

Status: completed. Same-page manual and automation outputs are recorded above.

### Popup screenshot and DOM data

Status: completed enough for mitigation. The popup is now screenshot-detected and the patrol stops with diagnostic artifacts.

Remaining useful evidence:

- Real Chrome process command line after each launch-flag experiment.
- Whether a single-variable change reduces or eliminates PDD startup slider challenge.
- Fresh same-page fingerprint output after each fingerprint-alignment experiment.

## Experiments to run

Run these one at a time. Do not bundle changes, because the goal is to isolate the root cause.

### Experiment A: remove fixed Playwright viewport

Change `contextOptions.viewport` from fixed `1920x1080` to `null` so visible Chrome uses its real maximized window dimensions.

Implementation status: applied. The browser runtime now defaults `viewport` and `contextOptions.viewport` to `null`. Test runs after this change should compare the new automation `screen`, `inner/outer`, and `visualViewport` values against the manual baseline.

2026-07-01 test result:

- Automation-launched Chrome opened as a maximized/full-screen visible window.
- PDD still showed the slider/puzzle verification, this time on the login page:

```text
https://mms.pinduoduo.com/login/?redirectUrl=https%3A%2F%2Fmms.pinduoduo.com%2Fhome%2F
```

- Local evidence shows the login branch captured a normal login-required screenshot:

```text
packages/worker/data/screenshots/7/login-required-1782896526957.png
```

- No new `security-challenge-*` diagnostic was generated for this login-page challenge. This means the current security-challenge guard catches the backend-home challenge path, but the login-page branch can still classify the same visual verification as `login-required` before running the challenge detector.
- Live Chrome process command-line evidence after this experiment still shows Playwright default launch signature such as `--remote-debugging-pipe` and multiple `--disable-*` flags, while `--window-size=1920,1080` remains absent.

Conclusion:

- Fixed Playwright viewport / fixed window size is not sufficient to explain the PDD challenge by itself.
- The challenge can appear before authenticated `/home/`, directly on `/login/`. This weakens hypotheses based only on backend module parsing, deep-link navigation, or post-login collector behavior.
- The next diagnostic fix should add the same screenshot/security-challenge guard inside the login-required path, so login-page slider verification is recorded as `security-challenge-login-*` instead of only `login-required-*`.
- Root-cause priority should now move more weight back to `navigator.webdriver=true`, Playwright launch signature, and profile trust-state differences.

Expected signal:

- Automation `inner/outer/screen/visualViewport` should become more natural and closer to manual Chrome.
- If slider verification disappears or becomes less frequent, viewport/window fingerprint was a major trigger.

Risk:

- Some collectors may see slightly different responsive layout dimensions.
- This must be tested as a single-variable change before touching `webdriver` or launch flags.

### Experiment B: align language list

Set context language preferences so automation reports:

```json
["zh-CN", "zh"]
```

Implementation status: applied. Automation now sets:

```text
Accept-Language: zh-CN,zh;q=0.9
Chrome profile Preferences: intl.accept_languages=zh-CN,zh
```

This is intentionally implemented through normal browser language preferences and request headers, not by overriding `navigator.languages` with a page init script.

2026-07-01 test result:

- PDD still showed the slider/puzzle verification on the login page after Experiment B.
- Worker logs showed the first `login page` security challenge check passed before the async slider dialog appeared.
- The run produced `login-required-1782900246929.png` instead of `security-challenge-login-page-*`, proving the login-page guard was present but ran too early for this async challenge.

Follow-up mitigation:

- Login flow now runs a second security-challenge check after `login_required` is detected and before the normal `login-required` screenshot/wait path.
- If the slider appears in that window, expected artifacts are named like:

```text
security-challenge-login-page-after-login-required-<timestamp>.png
security-challenge-login-page-after-login-required-<timestamp>.html
security-challenge-login-page-after-login-required-<timestamp>.json
```

Conclusion:

- Language mismatch is not sufficient to explain or prevent the platform challenge.
- The next root-cause experiment should move to the higher-priority profile trust-state or Playwright launch-signature suspects.

Expected signal:

- Low-risk fingerprint alignment.
- By itself this may not eliminate the popup, but it reduces one obvious mismatch.
- After the next patrol launch, same-page fingerprint output should be rechecked. Desired result:

```json
{
  "language": "zh-CN",
  "languages": ["zh-CN", "zh"]
}
```

### Experiment C: profile-only test

Launch automation using a copy of the manual Chrome profile or another profile with established PDD trust state.

Preparation status: profile copy prepared on 2026-07-01.

Source:

```text
C:\Users\34506\AppData\Local\Google\Chrome\User Data
```

Experiment profile root:

```text
D:\try\pdd-6\data\profile-experiments\manual-chrome-copy
```

Store 7 profile directory:

```text
D:\try\pdd-6\data\profile-experiments\manual-chrome-copy\1_store-7
```

Copy result:

```text
robocopy success code=1
files copied=1336
bytes copied=4.363 GB
failed=0
```

Key files confirmed:

```text
Local State
Default\Preferences
Default\Network\Cookies
```

2026-07-01 test result:

- Automation was launched with:

```text
BROWSER_PROFILE_ROOT=D:\try\pdd-6\data\profile-experiments\manual-chrome-copy
```

- PDD still showed the slider/puzzle verification on the login page.
- The copied manual Chrome profile did not directly inherit the manual Chrome PDD login state. Manual Chrome was logged in, but automation Chrome still landed on the QR-code login page.
- The run generated:

```text
packages/worker/data/screenshots/7/login-required-1782907559559.png
```

- No `security-challenge-login-page-after-login-required-*` artifact was generated in that run. Visual review of the saved `login-required` screenshot confirmed the slider dialog was present, so this was a screenshot-detection miss, not absence of the challenge.

Detection follow-up:

- The screenshot had a wide white area on the right side. The previous screenshot fallback depended on global dim-overlay sampling from the page corners, and the white area prevented the dim-overlay heuristic from activating.
- Screenshot fallback now also scans for a local slider-dialog panel even when the whole screenshot does not satisfy the global dim-overlay condition.

Conclusion:

- The copied profile experiment did not eliminate the PDD challenge.
- Because the copied profile also did not inherit the authenticated PDD state, this result does not fully rule out profile trust-state as a factor. It does show that a simple raw copy of the manual Chrome profile into the worker profile root is not enough.
- The next stronger suspects remain Playwright launch signature and `navigator.webdriver=true`.

### Experiment C2: manually initialize the automation profile

Status: partially completed on 2026-07-01.

Procedure:

1. Launch worker with the experiment profile root:

```text
BROWSER_PROFILE_ROOT=D:\try\pdd-6\data\profile-experiments\manual-chrome-copy
```

2. Confirm the live Chrome process uses:

```text
--user-data-dir=D:\try\pdd-6\data\profile-experiments\manual-chrome-copy\1_store-7
```

3. Manually scan-login in automation-launched Chrome.
4. Manually continue into patrol using the same profile.

Observed result:

- Manual scan login in the automation-launched profile did not trigger the slider verification.
- Patrol startup and earlier collection modules did not trigger the slider verification.
- The slider verification eventually appeared on the evaluation/comment data page.
- Latest captured screenshot:

```text
packages/worker/data/screenshots/7/comments-1782909037267.png
```

Interpretation:

- This is stronger evidence that profile/session trust-state matters for the login/startup phase.
- It does not fully solve the problem because PDD can still trigger a later page-specific challenge during module collection.
- The later challenge on the comment page may be caused by cumulative automated navigation/collection behavior, page-specific PDD risk scoring, Playwright launch signature, or `navigator.webdriver=true`.
- No new `security-challenge-*` artifact was generated for this run. The saved `comments` screenshot clearly contains the slider dialog, so this was a screenshot-detection miss. The screenshot fallback has since been updated to detect local slider-dialog panels even without a valid global dim-overlay signal.

Expected signal:

- If slider verification disappears, profile trust-state difference is a major root cause.
- If slider verification remains, automation/page fingerprint or Playwright launch signature is more likely.

Risk:

- Directly using the live default Chrome profile can corrupt or lock the profile if manual Chrome is open.
- Prefer testing with a copied profile, not the live default profile.

### Experiment D: launch-flag reduction

Keep the operator/store profile, but reduce avoidable Playwright default flags if possible.

2026-07-01 D1 implementation status: applied.

The worker now keeps the same profile, same visible Chrome mode, same viewport behavior, and same language settings, but expands `ignoreDefaultArgs` to remove these Playwright defaults:

```text
--disable-background-networking
--disable-component-update
--disable-default-apps
--disable-extensions
--disable-sync
--password-store=basic
--use-mock-keychain
```

Already-existing sandbox handling remains:

```text
--no-sandbox
```

Intentionally unchanged in D1:

```text
--remote-debugging-pipe
```

Reason:

- `--remote-debugging-pipe` is more sensitive because it is the Playwright control transport.
- Removing it in the same D1 run could break browser control and make the experiment inconclusive.
- If D1 does not change PDD behavior, later D sub-experiments can decide whether a CDP/manual-owned-browser architecture is worth testing separately.

Expected signal:

- If slider verification changes after reducing flags, startup signature is a likely factor.

Known sensitive flags to evaluate:

```text
--remote-debugging-pipe
--disable-extensions
--disable-sync
--disable-component-update
--disable-background-networking
--no-first-run
--password-store=basic
--use-mock-keychain
```

D1 test instruction:

1. Launch worker with the same experiment profile root:

```powershell
$env:BROWSER_PROFILE_ROOT="D:\try\pdd-6\data\profile-experiments\manual-chrome-copy"
pnpm --filter @pdd-inspector/worker dev
```

2. Start patrol.
3. Confirm the live Chrome process still uses:

```text
--user-data-dir=D:\try\pdd-6\data\profile-experiments\manual-chrome-copy\1_store-7
```

4. Check whether the D1 ignored flags are absent from the real Chrome command line.
5. Record whether PDD still shows the slider verification and at which phase.

### Experiment E: webdriver strategy

Observed difference:

```json
{
  "manual.webdriver": false,
  "automation.webdriver": true
}
```

Expected signal:

- This is likely the highest-weight page fingerprint signal.
- Treat carefully because stealth-style overrides can be brittle and may create other detectable inconsistencies.

### Experiment E1: external Chrome plus CDP connection

Status: applied as an opt-in diagnostic path on 2026-07-01.

Purpose:

Test whether PDD's slider is tied to Playwright's normal `launchPersistentContext()` startup signature by changing how Chrome is started, without adding page scripts or overriding `navigator.webdriver`.

Default behavior remains unchanged. E1 runs only when:

```powershell
$env:BROWSER_LAUNCH_MODE="external-cdp"
```

Recommended E1 run command:

```powershell
$env:BROWSER_PROFILE_ROOT="D:\try\pdd-6\data\profile-experiments\manual-chrome-copy"
$env:BROWSER_LAUNCH_MODE="external-cdp"
$env:BROWSER_CDP_PORT="9222"
pnpm --filter @pdd-inspector/worker dev
```

E1 startup behavior:

1. Acquire the same worker profile lock.
2. Apply the same profile Preferences cleanup from E0.
3. Start visible system Chrome directly with:

```text
--remote-debugging-port=9222
--user-data-dir=<active profile directory>
about:blank
```

4. Connect Playwright through CDP:

```text
http://127.0.0.1:9222
```

Expected real Chrome command-line difference:

- No `--remote-debugging-pipe`.
- No Playwright default `--disable-*` launch bundle from `launchPersistentContext()`.
- Still has `--remote-debugging-port=9222`, because CDP needs a connection endpoint.

Expected diagnostic questions:

- Does PDD still show the slider on `/home/`?
- Does the saved fingerprint still report `navigator.webdriver=true`?
- Does the saved `chromeProcesses.processes[]` command line now match the minimal external-CDP startup args?

Interpretation:

- If E1 removes the slider, the normal Playwright launch signature is a strong root-cause candidate.
- If E1 still shows the slider and `navigator.webdriver=true` remains, the page-level automation fingerprint becomes the strongest remaining candidate.
- If E1 still shows the slider but `navigator.webdriver` changes, profile/session or PDD-side risk state needs another isolated pass.

2026-07-01 observed E1 result:

- The saved Chrome process command line used the expected minimal external-CDP form:

```text
--remote-debugging-port=9222
--user-data-dir=D:\try\pdd-6\data\profile-experiments\manual-chrome-copy\1_store-7
about:blank
```

- The saved fingerprint reported:

```json
{
  "webdriver": false,
  "languages": ["zh-CN", "zh"],
  "window": {
    "innerWidth": 1536,
    "outerWidth": 1536,
    "devicePixelRatio": 1.25
  }
}
```

- The user-visible page did not show a slider verification dialog.
- The run was stopped by a screenshot false positive: the normal PDD dashboard chart tooltip was classified as `screenshot-modal-overlay`.

Follow-up mitigation:

- Screenshot fallback was tightened so normal backend chart tooltips/cards do not match the slider-dialog shape.
- Existing slider-dialog screenshot tests remain in place.

Interpretation update:

- E1 produced the cleanest browser fingerprint so far: minimal external-CDP command line and `navigator.webdriver=false`.
- The latest interruption was a detector false positive, not a confirmed PDD security challenge.
- Re-run E1 after the false-positive fix to see whether patrol can continue past startup.

### Experiment E0: profile-driven language and site zoom cleanup

Status: applied on 2026-07-01 as a pre-check before changing any webdriver-related behavior.

Reason:

- The 2026-07-01 D1 diagnostic still showed `navigator.languages=["zh-CN"]` even though the profile preferences had `intl.accept_languages=zh-CN,zh`.
- The same diagnostic showed `innerWidth=1920` and `outerWidth=1536`.
- The experiment profile `Default\Preferences` contained a PDD per-host zoom entry:

```json
{
  "partition": {
    "per_host_zoom_levels": {
      "x": {
        "mms.pinduoduo.com": {
          "zoom_level": -1.2239010857415447
        }
      }
    }
  }
}
```

Implementation:

- Remove Playwright context `locale`, so Playwright does not force `navigator.languages` to a single `["zh-CN"]` value.
- Keep HTTP `Accept-Language: zh-CN,zh;q=0.9`.
- Keep profile language preferences:

```json
{
  "intl": {
    "accept_languages": "zh-CN,zh",
    "selected_languages": "zh-CN,zh"
  }
}
```

- Remove only the `mms.pinduoduo.com` per-host zoom entry from Chrome profile Preferences, preserving other host zoom settings.

Expected signal after the next run:

```json
{
  "languages": ["zh-CN", "zh"],
  "window": {
    "innerWidth": "closer to the visible Chrome window",
    "outerWidth": 1536
  }
}
```

If PDD still triggers the slider after E0 but the language and geometry signals are aligned, the next investigation should move to the remaining high-weight signals: `navigator.webdriver=true`, `--remote-debugging-pipe`, and other Playwright control-channel signatures.

### Experiment F: navigation behavior

Start automation on the backend homepage and use PDD UI navigation instead of immediate deep links for the first module.

Expected signal:

- If verification is reduced, direct URL navigation may be a risk trigger.

2026-07-01 update:

- Because the challenge is now confirmed on `/home/`, this experiment is lower priority for the initial popup.
- It may still matter for later module transitions after the startup challenge is solved.

## Current evidence ranking

After the Step 1 command-line comparison, Step 2 same-page fingerprint comparison, successful popup detection JSON, and Experiment A result, the likely causes rank as:

1. `navigator.webdriver=true` in automation-launched Chrome.
2. Playwright launch signature and default arguments, especially `--remote-debugging-pipe` and multiple `--disable-*` flags.
3. Project-scoped automation profile trust state vs manual default Chrome profile.
4. `navigator.languages` mismatch: automation `["zh-CN"]` vs manual `["zh-CN", "zh"]`.
5. Viewport/screen/window geometry mismatch. Experiment A reduced this mismatch, but the challenge still appeared on the login page, so this is no longer sufficient as a standalone root cause.
6. Navigation behavior, lower priority for the initial popup because `/home/` already triggers it.

## Current mitigation status

Security-challenge detection now has two layers:

1. DOM/frame/shadow detection for visible captcha/verify/slider/puzzle elements and generic dim-overlay verification dialogs.
2. Screenshot-pixel fallback for a globally dimmed page with a centered, lower, or right-shifted bright dialog and slider-like lower track.

The guard now runs after patrol navigation and twice during login-state checks: once after the login page loads, and once after the page is classified as `login-required`. If the login page itself shows the slider verification, the expected artifacts are named like:

```text
security-challenge-login-page-<timestamp>.png
security-challenge-login-page-<timestamp>.html
security-challenge-login-page-<timestamp>.json
security-challenge-login-page-after-login-required-<timestamp>.png
security-challenge-login-page-after-login-required-<timestamp>.html
security-challenge-login-page-after-login-required-<timestamp>.json
```

2026-07-01 follow-up:

- A login-bind run reached `/home/`, passed the first security check, was classified as `authenticated_or_unknown`, and then closed Chrome as a successful login-bind.
- The user observed an immediate slider dialog during that window. This means the security check can also run too early on the authenticated-home branch.
- Login now waits briefly and runs another check before returning success:

```text
security-challenge-login-page-after-authenticated-<timestamp>.png
security-challenge-login-page-after-authenticated-<timestamp>.html
security-challenge-login-page-after-authenticated-<timestamp>.json
```

When a challenge is detected, the patrol writes a screenshot, page HTML, fingerprint, launch/runtime options, profile path, and frame/candidate diagnostic JSON under the store screenshot directory. It then marks the current patrol failed/paused and leaves the visible Chrome window open for manual handling.

2026-07-01 follow-up:

- The diagnostic JSON now also includes a `chromeProcesses` section.
- On Windows, `chromeProcesses.processes[]` records each live `chrome.exe` PID, parent PID, full command line, and `matchesProfile`.
- `matchesProfile=true` means the process command line contains the same profile path as the diagnostic `profileDirectory`.
- This is the source of truth for checking whether D1 launch flags actually disappeared from the real Chrome process.

This is a mitigation and evidence-capture improvement, not the root-cause fix. PDD may still show verification for automation-launched Chrome until the startup/profile/Playwright-signature difference is isolated and removed.

The root-cause objective remains:

```text
Make automation-launched Chrome look trusted enough that PDD does not show slider verification on startup.
```

## Next update slots

### Step 2 automation fingerprint
### Step 2 automation fingerprint

Status: completed. See `Same-page Step 2 fingerprint comparison` above.

### Popup screenshot references

Paste here:

```text
Screenshot path or attachment:
Observed time:
Page URL:
```

### Popup DOM diagnostic output

Paste here:

```json
{}
```

### Experiment results

Use this format:

```text
Experiment:
Date/time:
Changed variable:
Result:
Evidence:
Conclusion:
```
