import { expect, test } from '@playwright/test';

type Game = {
  sim: { t: number; over: boolean; speedKmh: number; harvest: { tank: number; stats: { cutCells: number; flattenedCells: number } } };
  frames: number;
  nearChunks: number;
  start(): void;
  press(code: string, on: boolean): void;
  setQuality(q: 'high' | 'low'): void;
};
const g = () => (window as unknown as { __game: Game }).__game;

test('ゲーム G0：開始して、ヘッダを下げて走ると小麦を刈れる', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)); });
  // ソフトウェア描画では株を描くと遅いので、走らせる間は軽量表示
  await page.goto('/game/game.html?q=low');
  await expect(page.locator('#start')).toBeVisible();
  await page.screenshot({ path: 'test-results/game-start.png' });
  await page.keyboard.press('Enter');
  await expect(page.locator('#start')).toBeHidden();
  await page.keyboard.press('Space'); // ヘッダを下げる
  await page.keyboard.down('KeyW'); // 長押しで加速
  await page.waitForFunction(() => (window as unknown as { __game: Game }).__game.sim.speedKmh > 4, undefined, { timeout: 120_000 });
  await page.keyboard.up('KeyW');
  await page.waitForFunction(() => (window as unknown as { __game: Game }).__game.sim.harvest.stats.cutCells > 500, undefined, { timeout: 180_000 });
  await expect(page.locator('#header')).toContainText('刈る');
  const hud = await page.locator('#speed').textContent();
  expect(Number(hud)).toBeGreaterThan(3);
  // 株を描いた表示で 1 枚（シェーダのエラーがないことも確かめる）
  await page.keyboard.press('Escape');
  await page.evaluate(() => (window as unknown as { __game: Game }).__game.setQuality('high'));
  const f0 = await page.evaluate(() => (window as unknown as { __game: Game }).__game.frames);
  await page.waitForFunction((f) => (window as unknown as { __game: Game }).__game.frames >= f + 2, f0, { timeout: 120_000 });
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'test-results/game-play.png' });
  expect(errors).toEqual([]);
  void g;
});
