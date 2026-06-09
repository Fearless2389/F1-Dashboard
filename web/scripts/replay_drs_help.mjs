// Verify Bahrain shows DRS zones + the Keys popover opens.
import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newContext({ viewport: { width: 1600, height: 900 } }).then(c => c.newPage());
  page.on("pageerror", err => console.log("PAGE.ERR", err.message));

  await page.goto("http://localhost:5180/replay/2025/4", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("svg path", { timeout: 30000 }).catch(() => {});
  // Wait for trajectory to finish loading — leader-glow indicates real data
  await page.waitForTimeout(7000);

  // Count green DRS overlay paths
  const drsInfo = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("svg path"));
    const greens = all.filter(p => p.getAttribute("stroke") === "#22e8c9");
    return {
      totalPaths: all.length,
      greenCount: greens.length,
      greenDs: greens.map(p => (p.getAttribute("d") ?? "").slice(0, 50)),
    };
  });
  console.log("DRS overlay state:", JSON.stringify(drsInfo, null, 2));
  await page.screenshot({ path: "C:/Users/ruthv/AppData/Local/Temp/replay_drs_bahrain.png" });

  // Press D to toggle off
  await page.keyboard.press("D");
  await page.waitForTimeout(300);
  const drsAfter = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("svg path"))
      .filter(p => p.getAttribute("stroke") === "#22e8c9").length;
  });
  console.log("DRS overlay paths after D press:", drsAfter);

  // Press H to open cheat sheet
  await page.keyboard.press("D");  // toggle back on
  await page.waitForTimeout(200);
  await page.keyboard.press("H");
  await page.waitForTimeout(400);
  const cheatSheet = await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll("*"))
      .find(e => e.textContent === "Keyboard Shortcuts");
    const kbds = document.querySelectorAll("kbd").length;
    return { visible: !!heading, kbdCount: kbds };
  });
  console.log("cheat sheet:", cheatSheet);
  await page.screenshot({ path: "C:/Users/ruthv/AppData/Local/Temp/replay_drs_bahrain_help.png" });

  await browser.close();
})();
