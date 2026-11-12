import { expect, test, type Browser, type Page } from '@playwright/test';
import { advanceTo, closeMoment, createRoom, joinRoom, newPhone, revealAndAck, setRoles, vote, type Seat } from './helpers';

/** Set SHOTS_DIR to save a screenshot of each new screen. */
const D = process.env.SHOTS_DIR;
const shot = async (p: Page, n: string, full = false) => {
  if (D) await p.screenshot({ path: `${D}/${n}.png`, fullPage: full });
};

async function table(browser: Browser, n: number, before?: (h: Page) => Promise<void>) {
  const { host, code } = await createRoom(browser, n);
  await setRoles(host, { mafia: 1, doctor: 1, detective: 1, villager: n - 3 });
  if (before) await before(host);
  const seats: Seat[] = [];
  for (let i = 1; i <= n; i++) seats.push({ name: `P${i}`, page: await joinRoom(browser, code, `P${i}`) });
  const tv = await newPhone(browser);
  await tv.setViewportSize({ width: 1280, height: 720 });
  await tv.goto(`/tv/${code}`);
  return { host, code, seats, tv };
}
async function start(t: { host: Page; seats: Seat[] }) {
  await t.host.getByRole('button', { name: 'Start the game' }).click();
  await expect(t.host.getByText('Role Reveal').first()).toBeVisible();
  for (const s of t.seats) await revealAndAck(s);
}
const hostTo = async (host: Page, phase: string) => {
  for (let i = 0; i < 6 && (await host.getByTestId('host-phase').innerText()).trim() !== phase; i++) {
    const now = (await host.getByTestId('host-phase').innerText()).trim();
    await host.getByRole('button', { name: /Next phase|Start voting/ }).click();
    await expect(host.getByTestId('host-phase')).not.toHaveText(now);
  }
};

test('offline voting: no ballots on phones, the host enters who is out; lobby cards, night scene, TV news strip', async ({ browser }) => {
  const t = await table(browser, 5, async (h) => {
    await h.locator('summary', { hasText: /^Voting/ }).click();
    await h.getByText('Offline voting (show of hands)').click();
    await expect(h.getByLabel(/Offline voting/)).toBeChecked();
    await shot(h, 'A1-host-lobby', true);
  });
  const p = t.seats[0].page;
  await expect(p.getByTestId('howto')).toBeVisible();
  await shot(p, 'A2-player-lobby', true);
  await start(t);
  await hostTo(t.host, 'Night');
  await expect(p.locator('.night-scene')).toBeVisible({ timeout: 15_000 });
  await expect(t.tv.getByTestId('tv-news')).toBeVisible();
  await p.waitForTimeout(3500);
  await shot(p, 'A3-player-night', true);
  await shot(t.tv, 'A4-tv-night');
  await hostTo(t.host, 'Day');
  for (const s of t.seats) await closeMoment(s.page);
  await hostTo(t.host, 'Vote');
  // Phones: no ballot. Host: Next is off, and the result buttons are there.
  await expect(p.getByText(/show of hands/)).toBeVisible();
  await expect(p.getByRole('button', { name: /Open your ballot/ })).toHaveCount(0);
  await expect(t.host.getByRole('button', { name: /Next phase/ })).toBeDisabled();
  await t.host.setViewportSize({ width: 1366, height: 768 });
  await p.waitForTimeout(3000);
  await shot(t.host, 'A5-host-offline-vote', true);
  await shot(p, 'A6-player-offline-vote', true);
  await shot(t.tv, 'A7-tv-offline-vote');
  await t.host.getByTestId('host-verdict').getByRole('button', { name: 'P2' }).click();
  await t.host.getByRole('button', { name: /Yes, P2 is out/ }).click();
  await expect(t.tv.getByTestId('moment-card')).toHaveAttribute('data-player', 'P2', { timeout: 15_000 });
  await expect(t.host.locator('li[data-player="P2"]').getByText(/Voted out/)).toBeVisible();
  await t.tv.waitForTimeout(3000);
  await shot(t.tv, 'A8-tv-voted-out');
});

test('a quick preset sets the short clocks in one tap', async ({ browser }) => {
  const { host } = await createRoom(browser, 6);
  await host.locator('[data-preset="quick"]').click();
  await expect(host.getByLabel(/^Night \(seconds\)/)).toHaveValue('20');
  await expect(host.getByLabel(/^Vote \(seconds\)/)).toHaveValue('20');
  await host.locator('[data-preset="classic"]').click();
  await expect(host.getByLabel(/^Night \(seconds\)/)).toHaveValue('30');
});

test('the vote count plays before the result, and the game-over screens show awards', async ({ browser }) => {
  const t = await table(browser, 5);
  await start(t);
  await hostTo(t.host, 'Night');
  await hostTo(t.host, 'Day');
  for (const s of t.seats) await closeMoment(s.page);
  await advanceTo({ host: t.host } as never, 'Vote');
  const picks = ['P2', 'P1', 'P2', 'P2', 'P1'];
  for (let i = 0; i < 5; i++) await vote(t.seats[i], picks[i]);
  await expect(t.tv.getByTestId('vote-count')).toBeVisible({ timeout: 20_000 });
  await expect(t.tv.getByTestId('vote-count').locator('.vc-row').first()).toContainText('P2');
  await t.tv.waitForTimeout(1400);
  await shot(t.tv, 'B1-tv-vote-count');
  await shot(t.seats[2].page, 'B2-phone-vote-count');
  await t.tv.waitForTimeout(3500);
  await shot(t.tv, 'B3-tv-vote-card');
  await t.host.getByRole('button', { name: 'End game' }).click();
  const c = t.host.getByRole('button', { name: /End game|Yes/ }).last();
  if (await c.isVisible()) await c.click();
  await expect(t.tv.getByTestId('tv-finale')).toBeVisible({ timeout: 20_000 });
  await expect(t.tv.getByTestId('tv-awards')).toContainText('Most suspected', { timeout: 30_000 });
  await t.tv.waitForTimeout(4000);
  await shot(t.tv, 'B4-tv-over');
  await expect(t.seats[2].page.getByTestId('awards')).toContainText('P2', { timeout: 30_000 });
  await shot(t.seats[2].page, 'B5-phone-over', true);
});
