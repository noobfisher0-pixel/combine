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

test('ゲーム G2：マップを選ぶと説明とボットの目安が出て、障害物のある畑で始められる', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)); });
  await page.goto('/game/game.html?q=low');
  await expect(page.locator('#mapInfo')).toContainText('シード');
  await page.locator('input[name=diff][value=hard]').check();
  await page.locator('#seedInput').fill('e2e-hard');
  await expect(page.locator('#mapInfo')).toContainText('シード「e2e-hard」');
  await expect(page.locator('#mapInfo')).toContainText('ha');
  // ボットの目安（Worker）が出るまで待つ
  await expect(page.locator('#mapInfo')).toContainText(/ボットの目安 [0-9.]+ t/, { timeout: 120_000 });
  await page.locator('#startBtn').click();
  await expect(page.locator('#start')).toBeHidden();
  const obs = await page.evaluate(() => (window as unknown as { __game: { sim: { map: { obstacles: unknown[]; seed: string } } } }).__game.sim.map);
  expect(obs.seed).toBe('e2e-hard');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/game-hard-map.png' });
  expect(errors).toEqual([]);
});

test('ゲーム G3：キーの割り当て、ミニマップ、ガイドライン、ベスト記録と共有', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)); });
  await page.goto('/game/game.html?q=low');
  await page.locator('input[name=map][value=standard]').check();
  await expect(page.locator('#bestInfo')).toContainText('記録はまだ');
  // 加速を I キーに割り当てる
  await page.locator('#start .settingsBtn').click();
  await page.locator('#bindList button[data-act=up]').click();
  await expect(page.locator('#bindList button[data-act=up]')).toContainText('キーを押す');
  await page.keyboard.press('KeyI');
  await expect(page.locator('#bindList')).toContainText('I');
  await page.locator('#settingsClose').click();
  await expect(page.locator('#keyList')).toContainText('I / ↑');
  await page.locator('#startBtn').click();
  await page.keyboard.press('Space');
  await page.keyboard.down('KeyI');
  await page.waitForFunction(() => (window as unknown as { __game: { sim: { combine: { vTarget: number } } } }).__game.sim.combine.vTarget > 2, undefined, { timeout: 120_000 });
  await page.keyboard.up('KeyI');
  // ミニマップに描かれている（中央付近の画素が透明でない）、Tab で拡大
  const alpha = await page.evaluate(() => {
    const c = document.getElementById('miniCanvas') as HTMLCanvasElement;
    return c.getContext('2d')!.getImageData(c.width / 2, c.height / 2, 1, 1).data[3];
  });
  expect(alpha).toBe(255);
  await page.keyboard.press('Tab');
  await expect(page.locator('#mini')).toHaveClass(/big/);
  await page.keyboard.press('Tab');
  // ガイドライン（ふつうでは表示）
  await page.waitForFunction(() => (window as unknown as { __game: { guide: unknown } }).__game.guide !== null, undefined, { timeout: 60_000 });
  await page.screenshot({ path: 'test-results/game-g3.png' });
  // 時間切れまで → ベスト更新と共有の文字列 → タイトルにベストが出る
  await page.evaluate(() => (window as unknown as { __game: Game }).__game.fastForward(60 * 60 * 5));
  await expect(page.locator('#result')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#bestResult')).toContainText('ベスト更新');
  await expect(page.locator('#shareText')).toHaveValue(/v\d+-normal-standard [0-9.]+ t/);
  await page.locator('#titleBtn').click();
  await expect(page.locator('#bestInfo')).toContainText('あなたのベスト');
  expect(errors).toEqual([]);
});

test('ゲーム G4：開始のクリックで音が鳴り始め、M で消える。刈っている間は土ぼこりが出る', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)); });
  await page.goto('/game/game.html?q=low');
  type G = { __game: { audio: { state: string; muted: boolean }; dust: number; sim: { harvest: { feedKgS: number } } } };
  expect(await page.evaluate(() => (window as unknown as G).__game.audio.state)).toBe('none');
  await page.locator('input[name=map][value=standard]').check();
  await page.locator('#startBtn').click();
  expect(await page.evaluate(() => (window as unknown as G).__game.audio.state)).not.toBe('none');
  await page.keyboard.press('KeyM');
  expect(await page.evaluate(() => (window as unknown as G).__game.audio.muted)).toBe(true);
  await page.keyboard.press('KeyM');
  expect(await page.evaluate(() => (window as unknown as G).__game.audio.muted)).toBe(false);
  await page.keyboard.press('Space');
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => (window as unknown as G).__game.sim.harvest.feedKgS > 2, undefined, { timeout: 180_000 });
  await page.keyboard.up('KeyW');
  await page.waitForFunction(() => (window as unknown as G).__game.dust > 5, undefined, { timeout: 120_000 });
  await page.screenshot({ path: 'test-results/game-g4.png' });
  expect(errors).toEqual([]);
});

test('ゲーム：チュートリアルが始まり、手順の案内が出る', async ({ page }) => {
  await page.goto('/game/game.html?q=low');
  await page.locator('#tutBtn').click();
  await expect(page.locator('#tut')).toBeVisible();
  await expect(page.locator('#tutStep')).toHaveText('1 / 5');
  await expect(page.locator('#time')).toBeVisible();
});
