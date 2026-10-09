import { expect, test } from '@playwright/test';

type Api = {
  violations: unknown[];
  setMode(m: '外観' | 'X線' | '断面'): void;
  info(): { calls: number; triangles: number };
  setCamera(name: string): void;
  setMachine(m: Record<string, unknown>): void;
  animatedCount: number;
  blurred: string[];
  phaseOf(k: string): number | undefined;
  frames: number;
  setExplode(f: number): void;
  flow: { count: Record<string, number>; tankMass: number; cutting: boolean };
  setTankMass(kg: number): void;
  setHeader(h: 'draper' | 'corn'): void;
  setLabels(on: boolean): void;
  harvest: { maxSpeed: number; checks: Array<{ id: string; ok: boolean }> } | null;
};

test('ブロックアウトが表示され、作業姿勢で干渉 0 件', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await expect(page.locator('#check .badge')).toHaveText('干渉 0 件');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/exterior.png' });

  const budget = await page.evaluate(() => (window as unknown as { __combine: Api }).__combine.info());
  expect(budget.calls).toBeLessThanOrEqual(250); // design §9.4
  expect(budget.triangles).toBeLessThanOrEqual(300_000);

  for (const [mode, file] of [['X線', 'xray'], ['断面', 'section']] as const) {
    await page.evaluate((m) => (window as unknown as { __combine: Api }).__combine.setMode(m), mode);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `test-results/${file}.png` });
  }
  await page.evaluate(() => { const c = (window as unknown as { __combine: Api }).__combine; c.setMode('外観'); c.setCamera('真横左'); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/side-left.png' });
  expect(errors).toEqual([]);
});

test('動き：運転中は各部が動き、ヘッダを止めるとリールとナイフが止まる', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#check .badge')).toHaveText('干渉 0 件');
  // ヘッドレスのソフトウェア描画は 1 フレームが遅いので、時間ではなくフレーム数で待つ
  const waitFrames = async (n: number) => {
    const f0 = await page.evaluate(() => (window as unknown as { __combine: Api }).__combine.frames);
    await page.waitForFunction((f) => (window as unknown as { __combine: Api }).__combine.frames >= f, f0 + n, { timeout: 60_000 });
  };
  const phases = () => page.evaluate(() => {
    const a = (window as unknown as { __combine: Api }).__combine;
    return { reel: a.phaseOf('reel')!, knife: a.phaseOf('knife')!, wheel: a.phaseOf('wheelFront')!, slat: a.phaseOf('draperSide')! };
  });
  expect(await page.evaluate(() => (window as unknown as { __combine: Api }).__combine.animatedCount)).toBeGreaterThan(5);
  const p0 = await phases();
  await waitFrames(3);
  const p1 = await phases();
  expect(p1.reel).not.toBe(p0.reel);
  expect(p1.knife).not.toBe(p0.knife);
  expect(p1.wheel).not.toBe(p0.wheel);
  expect(p1.slat).not.toBe(p0.slat);
  await expect(page.locator('#readout')).toContainText('リール');
  await page.evaluate(() => (window as unknown as { __combine: Api }).__combine.setMachine({ headerOn: false }));
  await waitFrames(2);
  const p2 = await phases();
  await waitFrames(3);
  const p3 = await phases();
  expect(p3.reel).toBe(p2.reel);
  expect(p3.knife).toBe(p2.knife);
  expect(p3.wheel).not.toBe(p2.wheel); // 走行は続く
  await page.screenshot({ path: 'test-results/motion.png' });
  expect(errors).toEqual([]);
});

test('収穫の成立チェックのパネルが表示され、W-1〜W-6 が並ぶ', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#harvest li')).toHaveCount(6, { timeout: 60_000 });
  const h = await page.evaluate(() => (window as unknown as { __combine: Api }).__combine.harvest);
  expect(h!.maxSpeed).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/harvest.png' });
});

test('内部機構：断面・X線・分解で中が見え、エラーが出ない', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await expect(page.locator('#check .badge')).toHaveText('干渉 0 件');
  const api = (fn: string, arg: unknown) => page.evaluate(([f, a]) => ((window as unknown as { __combine: Record<string, (x: unknown) => void> }).__combine[f as string])(a), [fn, arg] as const);
  await api('setMode', '断面');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/m3-section.png' });
  await api('setMode', 'X線');
  await api('setCamera', '斜め前');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/m3-xray.png' });
  await api('setMode', '外観');
  await api('setExplode', 1);
  await expect(page.locator('#check .badge')).toHaveText('分解表示中');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/m3-explode.png' });
  const info = await page.evaluate(() => (window as unknown as { __combine: Api }).__combine.info());
  expect(info.calls).toBeLessThanOrEqual(400);
  expect(info.triangles).toBeLessThanOrEqual(300_000);
  expect(errors).toEqual([]);
});

test('作物フロー：刈り取り中は粒子が流れ、タンクに穀粒がたまる', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#check .badge')).toHaveText('干渉 0 件');
  // 再生を速めて、穀粒がタンクに届くまで待つ（フレーム数で待つ）
  await page.evaluate(() => (window as unknown as { __combine: Api }).__combine.setMachine({ timeScale: 1 }));
  await page.waitForFunction(() => (window as unknown as { __combine: Api }).__combine.flow.tankMass > 0, undefined, { timeout: 120_000 });
  const st = await page.evaluate(() => (window as unknown as { __combine: Api }).__combine.flow);
  expect(st.cutting).toBe(true);
  for (const k of ['crop', 'straw', 'grain']) expect(st.count[k], k).toBeGreaterThan(0);
  await expect(page.locator('#readout')).toContainText('タンク');
  await page.evaluate(() => { const c = (window as unknown as { __combine: Api }).__combine; c.setMachine({ timeScale: 0.1 }); c.setMode('断面'); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/m4-flow-section.png' });
  expect(errors).toEqual([]);
});

test('M5：コーンヘッドに切り替えても干渉 0 件、ラベルから説明パネルが開く', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await expect(page.locator('#check .badge')).toHaveText('干渉 0 件');
  await page.evaluate(() => { const c = (window as unknown as { __combine: Api }).__combine; c.setHeader('corn'); c.setLabels(true); c.setCamera('斜め前'); });
  await expect(page.locator('#check .badge')).toHaveText('干渉 0 件');
  await expect(page.locator('.labels .label', { hasText: 'クロスオーガ' })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/m5-corn.png' });
  const info = await page.evaluate(() => (window as unknown as { __combine: Api }).__combine.info());
  expect(info.calls).toBeLessThanOrEqual(250);
  await page.locator('.labels .label', { hasText: 'ロータ' }).first().click();
  await expect(page.locator('#info .desc')).toContainText('脱穀');
  expect(errors).toEqual([]);
});

