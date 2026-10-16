import { expect, test } from '@playwright/test';
import { revealAndAck, setupTable } from './helpers';

test('a phone that drops off mid-game reconnects by itself, keeps its seat, and keeps the screen awake', async ({ browser }) => {
  const t = await setupTable(browser, 5, { mafia: 1, detective: 1, doctor: 1, villager: 2 });
  const p = t.seats[0];

  // Wi-Fi drops for a while…
  await p.page.context().setOffline(true);
  await expect(p.page.getByText(/Connection lost — reconnecting automatically/)).toBeVisible({ timeout: 20_000 });
  // …and comes back: the phone reconnects on its own, without a reload.
  await p.page.context().setOffline(false);
  await expect(p.page.getByText(/Connection lost/)).toHaveCount(0, { timeout: 10_000 });
  // Still in the same seat with the same role, and can act.
  expect(await revealAndAck(p)).toBe(p.role);
  for (const s of t.seats.slice(1)) await revealAndAck(s);
  await expect(t.host.getByTestId('host-phase')).toHaveText('Night');
});

test('Screen Wake Lock is requested in a game room and released when leaving', async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    sessionStorage.setItem('mafia-night:intro-seen', '1');
    const w = window as any;
    w.__wake = { requested: 0, released: 0 };
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        request: async () => {
          w.__wake.requested++;
          const handlers: (() => void)[] = [];
          return { release: async () => (w.__wake.released++, handlers.forEach((h) => h())), addEventListener: (_: string, h: () => void) => handlers.push(h) };
        },
      },
    });
  });
  const host = await ctx.newPage();
  await host.goto('/charades/host');
  await host.getByLabel('Host code').fill('e2e-host-code');
  await host.getByLabel('Your name').fill('Judge');
  await host.getByRole('button', { name: 'Open the room' }).click();
  await host.waitForURL(/\/c\/[A-Z0-9]{5}$/);
  await expect.poll(() => host.evaluate(() => (window as any).__wake.requested)).toBeGreaterThan(0);
  // Leaving the room lets the screen sleep again.
  await host.getByRole('button', { name: 'Home menu' }).click();
  await host.getByRole('menuitem', { name: /Main menu/ }).click();
  await expect.poll(() => host.evaluate(() => (window as any).__wake.released)).toBeGreaterThan(0);
});
