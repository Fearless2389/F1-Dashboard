// Verify tyre-age renders in the tower and keyboard shortcuts work.
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const OUT = "C:/Users/ruthv/AppData/Local/Temp/replay_tyre_keys";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newContext({ viewport: { width: 1600, height: 900 } }).then(c => c.newPage());
  page.on("pageerror", err => console.log("PAGE.ERR", err.message));

  await page.goto("http://localhost:5180/replay/2025/1", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("svg path", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);

  // Press 5 → 32× via keyboard
  await page.keyboard.press("5");
  console.log("→ pressed 5 (should switch to 32×)");
  await page.waitForTimeout(200);

  // Press SPACE to play
  await page.keyboard.press(" ");
  console.log("→ pressed SPACE (play)");
  await page.waitForTimeout(8000);

  // Check timing tower content
  const tower = await page.evaluate(() => {
    // Look for any tyre-age tag — "L1", "L23" etc next to the compound chip
    const text = document.body.innerText;
    const matches = Array.from(text.matchAll(/L(\d+)/g)).map(m => m[0]);
    return { sample: matches.slice(0, 12), count: matches.length };
  });
  console.log("tyre-age tags seen:", tower);

  await page.screenshot({ path: join(OUT, "01_after_keys.png") });

  // Press L to toggle driver labels on map
  await page.keyboard.press("L");
  console.log("→ pressed L (toggle labels)");
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, "02_labels_on.png") });

  // Count driver text labels on the map
  const labelInfo = await page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll("svg g[transform] text"))
      .map(t => t.textContent ?? "")
      .filter(t => /^[A-Z]{3}/.test(t));
    return { count: texts.length, sample: texts.slice(0, 10) };
  });
  console.log("on-track labels:", labelInfo);

  // Press SPACE again to pause
  await page.keyboard.press(" ");
  await page.waitForTimeout(300);
  const isPaused = await page.evaluate(() => {
    return !!Array.from(document.querySelectorAll("button"))
      .find(b => b.textContent === "Play");
  });
  console.log("after second SPACE press, Play visible (paused):", isPaused);

  // Try 1 → speed 2×
  await page.keyboard.press("1");
  await page.waitForTimeout(200);
  const speedActive = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons
      .filter(b => /^\d+×$/.test(b.textContent ?? ""))
      .map(b => ({
        label: b.textContent,
        active: b.className.includes("text-f1-red") || b.className.includes("bg-f1-red"),
      }));
  });
  console.log("speed buttons after key '1':", speedActive);

  // Esc to deselect
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  await browser.close();
  console.log("done", OUT);
})();
