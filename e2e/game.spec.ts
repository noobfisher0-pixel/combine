import { expect, test } from '@playwright/test';

type Game = {
  sim: {
    t: number; over: boolean; speedKmh: number; truck: number; rank: string;
    harvest: { tank: number; stats: { cutCells: number } };
    cart: { state: string; load: number };
  };
  frames: number;
  nearChunks: number;
  setQuality(q: 'high' | 'low'): void;
  fastForward(n: number, keys?: number): void;
};
const api = () => (window as unknown as { __game: Game }).__game;

test('ゲーム G0〜G1：刈って、カートを呼んで排出し、時間切れで結果が出る', async ({ page }) => {
  test.setTimeout(300_000);
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
  await page.waitForFunction(() => (window as unknown as { __game: Game }).__game.sim.harvest.stats.cutCells > 300, undefined, { timeout: 180_000 });
  await expect(page.locator('#header')).toContainText('刈る');

  // カートを呼ぶ → 横に来たら排出オーガを出す（描かずに早送りして待つ）
  await page.keyboard.press('KeyE');
  await page.evaluate(() => {
    const g = (window as unknown as { __game: Game }).__game;
    for (let i = 0; i < 60 * 40 && g.sim.cart.state !== 'alongside'; i++) g.fastForward(1);
  });
  expect(await page.evaluate(() => (window as unknown as { __game: Game }).__game.sim.cart.state)).toBe('alongside');
  await page.keyboard.press('KeyQ');
  await page.evaluate(() => (window as unknown as { __game: Game }).__game.fastForward(60 * 3));
  await page.waitForFunction(() => (window as unknown as { __game: Game }).__game.sim.cart.load > 500, undefined, { timeout: 60_000 });
  await expect(page.locator('#cartState')).toContainText('並走');

  // 株を描いた表示で 1 枚（シェーダのエラーがないことも確かめる）
  await page.keyboard.press('Escape');
  await page.evaluate(() => (window as unknown as { __game: Game }).__game.setQuality('high'));
  const f0 = await page.evaluate(() => (window as unknown as { __game: Game }).__game.frames);
  await page.waitForFunction((f) => (window as unknown as { __game: Game }).__game.frames >= f + 2, f0, { timeout: 120_000 });
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'test-results/game-play.png' });
  await page.evaluate(() => (window as unknown as { __game: Game }).__game.setQuality('low'));

  // 時間切れまで早送り → 結果（並走中のカートの中身は数える）
  await page.evaluate(() => (window as unknown as { __game: Game }).__game.fastForward(60 * 60 * 5));
  await expect(page.locator('#result')).toBeVisible({ timeout: 60_000 });
  const truck = await page.evaluate(() => (window as unknown as { __game: Game }).__game.sim.truck);
  expect(truck).toBeGreaterThan(500);
  await expect(page.locator('#resultRank')).toHaveText(/^[SABC]$/);
  await page.screenshot({ path: 'test-results/game-result.png' });
  expect(errors).toEqual([]);
  void api;
});

test('ゲーム：チュートリアルが始まり、手順の案内が出る', async ({ page }) => {
  await page.goto('/game/game.html?q=low');
  await page.locator('#tutBtn').click();
  await expect(page.locator('#tut')).toBeVisible();
  await expect(page.locator('#tutStep')).toHaveText('1 / 5');
  await expect(page.locator('#time')).toBeVisible();
});
