// Confirm driver labels render by default (without pressing L).
import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newContext({ viewport: { width: 1600, height: 900 } }).then(c => c.newPage());
  await page.goto("http://localhost:5180/replay/2025/1", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("svg path", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);

  // No keys pressed — labels should be visible by default
  const info = await page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll("svg g[transform] text"))
      .map(t => t.textContent ?? "")
      .filter(t => /^[A-Z]{3}/.test(t));
    return { count: texts.length, sample: texts.slice(0, 12) };
  });
  console.log("default on-track labels:", info);
  await page.screenshot({ path: "C:/Users/ruthv/AppData/Local/Temp/replay_labels_default.png" });

  // Now press L to toggle off
  await page.keyboard.press("L");
  await page.waitForTimeout(300);
  const off = await page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll("svg g[transform] text"))
      .map(t => t.textContent ?? "")
      .filter(t => /^[A-Z]{3}/.test(t));
    return { count: texts.length };
  });
  console.log("after L press:", off);

  await browser.close();
})();
