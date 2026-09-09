import { test, expect, type Page } from '@playwright/test';
async function login(page: Page, id: string, role: string, password = 'browser-test-password') {
  await page.goto('/login');
  await page.getByRole('button', { name: role, exact: true }).click();
  await page.getByLabel(role === 'ADMIN' ? 'Admin username' : 'Team ID', { exact: true }).fill(id);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Enter ' + role.toLowerCase() + ' arena' }).click();
}
async function request(page: Page, path: string, body?: any) {
  return page.evaluate(
    async ({ path, body }) => {
      const s = await (await fetch('/api/auth/session')).json();
      const r = await fetch('/api' + path, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': s.csrf },
        body: body ? JSON.stringify({ operationId: crypto.randomUUID(), ...body }) : undefined,
      });
      return { status: r.status, data: await r.json() };
    },
    { path, body },
  );
}
test('two-role competition: chess, debugging, frozen timer, shop, premium sets, admin revocation and reconnect', async ({
  browser,
}) => {
  const contexts = await Promise.all(
    Array.from({ length: 5 }, () =>
      browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    ),
  );
  const [chess, debug, third, opponent, admin] = await Promise.all(
    contexts.map((c) => c.newPage()),
  );
  const errors: string[] = [];
  for (const page of [chess, debug, admin]) page.on('pageerror', (e) => errors.push(e.message));
  try {
    await login(chess, 'TEAM-001', 'CHESS');
    await expect(chess.getByText('Make your next move.')).toBeVisible();
    await login(debug, 'TEAM-001', 'DEBUGGING');
    await expect(debug.getByText('Make your next move.')).toBeVisible();
    await login(third, 'TEAM-001', 'CHESS');
    await expect(third.getByRole('alert')).toHaveText(
      'Maximum active participants reached for this team.',
    );
    expect((await request(debug, '/team')).data.sessions).toHaveLength(2);
    await chess.getByRole('link', { name: 'Chess Arena', exact: true }).click();
    await chess.getByRole('button', { name: 'Find opponent' }).click();
    await expect(chess.getByText('Waiting for your opponent…')).toBeVisible();
    await login(opponent, 'TEAM-002', 'CHESS');
    await opponent.getByRole('link', { name: 'Chess Arena', exact: true }).click();
    await opponent.getByRole('button', { name: 'Find opponent' }).click();
    await expect(chess.getByLabel('Move from')).toBeVisible();
    const m = (await request(chess, '/chess/matches')).data[0],
      white = m.white_team === 'TEAM-001' ? chess : opponent,
      black = white === chess ? opponent : chess;
    async function move(p: Page, from: string, to: string, ply: number) {
      await expect(p.getByRole('button', { name: 'Move', exact: true })).toBeEnabled();
      await p.getByLabel('Move from').fill(from);
      await p.getByLabel('Move to').fill(to);
      await p.getByRole('button', { name: 'Move', exact: true }).click();
      await expect
        .poll(async () => (await request(p, '/chess/matches/' + m.id)).data.ply)
        .toBe(ply + 1);
    }
    await move(white, 'e2', 'e4', 0);
    await move(black, 'd7', 'd5', 1);
    await move(white, 'e4', 'd5', 2);
    await move(black, 'd8', 'd5', 3);
    await expect
      .poll(async () =>
        (await request(debug, '/team/activity')).data.some(
          (x: any) => x.type === 'CHESS_CAPTURE' && x.amount === 10,
        ),
      )
      .toBe(true);
    await debug.getByRole('link', { name: 'Debugging Arena', exact: true }).click();
    await debug.getByRole('button', { name: /Shared rows/ }).click();
    await expect(debug.getByRole('heading', { name: 'Shared rows' })).toBeVisible();
    await debug.getByRole('button', { name: 'B 7', exact: true }).click();
    await debug.getByRole('button', { name: 'Lock in answer' }).click();
    await expect(debug.getByText('Well spotted.')).toBeVisible();
    await expect
      .poll(async () => (await request(chess, '/team/score')).data.debugging_earned)
      .toBe(30);
    await debug.screenshot({ path: 'docs/validation/debugging-desktop.png', fullPage: true });
    await debug.getByRole('link', { name: 'Reward Shop', exact: true }).click();
    await debug
      .locator('article')
      .filter({ has: debug.getByRole('heading', { name: 'Freeze Time', exact: true }) })
      .getByRole('button', { name: 'Purchase', exact: true })
      .click();
    await expect(debug.getByText('Freeze Time is yours.')).toBeVisible();
    await debug.getByRole('link', { name: 'Debugging Arena', exact: true }).click();
    await debug.getByRole('button', { name: /Closure in a loop/ }).click();
    await debug.getByRole('button', { name: /Freeze Time/ }).click();
    await expect(debug.getByText('TIME FROZEN')).toBeVisible();
    const before = (await request(debug, '/debug/current')).data.remainingMs;
    await debug.waitForTimeout(1200);
    const after = (await request(debug, '/debug/current')).data.remainingMs;
    expect(Math.abs(before - after)).toBeLessThan(100);
    await debug.getByRole('button', { name: 'D 3', exact: true }).click();
    await debug.getByRole('button', { name: 'Lock in answer' }).click();
    await expect(debug.getByText('Well spotted.')).toBeVisible();
    await debug.getByRole('link', { name: 'Reward Shop', exact: true }).click();
    await debug.getByRole('button', { name: 'Premium questions', exact: true }).click();
    await debug
      .locator('article')
      .first()
      .getByRole('button', { name: 'Unlock', exact: true })
      .click();
    await expect(debug.getByText(/1 question unlocked/)).toBeVisible();
    await debug.getByRole('button', { name: 'Question sets', exact: true }).click();
    await debug
      .locator('article')
      .first()
      .getByRole('button', { name: 'Unlock', exact: true })
      .click();
    await expect(debug.getByText(/25 questions unlocked/)).toBeVisible();
    const owned = (await request(debug, '/debug/questions')).data.filter(
      (x: any) => x.set_id === 'SET-1' && x.owned,
    );
    expect(owned).toHaveLength(25);
    expect(owned.every((x: any) => x.points === 50)).toBe(true);
    expect(new Set(owned.map((x: any) => x.language)).size).toBe(5);
    const state = (await request(chess, '/chess/matches/' + m.id)).data;
    await expect
      .poll(
        async () =>
          (await request(chess, '/chess/matches/' + m.id)).data.moves.filter(
            (v: any) => v.analysis_status === 'COMPLETE',
          ).length,
        { timeout: 15000 },
      )
      .toBe(4);
    expect(state.moves.every((x: any) => !('evaluation_before' in x))).toBe(true);
    await chess.screenshot({ path: 'docs/validation/chess-desktop.png', fullPage: true });
    await debug.getByRole('link', { name: 'Leaderboard', exact: true }).click();
    await expect(debug.getByText(/standings are delayed/)).toBeVisible();
    await login(admin, 'browser-admin', 'ADMIN', 'browser-admin-password');
    await expect(admin.getByRole('heading', { name: 'Command center' })).toBeVisible();
    await admin.screenshot({ path: 'docs/validation/admin-desktop.png', fullPage: true });
    const sessionId = (await request(chess, '/auth/session')).data.session.id;
    const score = (await request(debug, '/team/score')).data.balance;
    expect(
      (
        await request(admin, '/admin/sessions/' + sessionId + '/revoke', {
          reason: 'Browser test force logout',
        })
      ).status,
    ).toBe(200);
    await expect(chess.getByRole('heading', { name: 'Take your position.' })).toBeVisible();
    await login(chess, 'TEAM-001', 'CHESS');
    await expect(chess.getByText('Make your next move.')).toBeVisible();
    expect((await request(chess, '/team/score')).data.balance).toBe(score);
    const tx = (await request(chess, '/team/activity')).data;
    expect(new Set(tx.map((t: any) => t.operation_id)).size).toBe(tx.length);
    await chess.setViewportSize({ width: 390, height: 844 });
    await chess.screenshot({ path: 'docs/validation/dashboard-mobile.png', fullPage: true });
    expect(
      await chess.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    for (const context of contexts) await context.close();
  }
});
test('poster landing, keyboard entry and mobile layout', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Enter competition/ })).toBeVisible();
  await page.screenshot({ path: 'docs/validation/landing-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'docs/validation/landing-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: /Explore the rules/ }).click();
  await expect(page.getByRole('heading', { name: 'Code. Strategize. Conquer.' })).toBeVisible();
});
