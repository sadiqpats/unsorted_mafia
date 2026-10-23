import { expect, test } from '@playwright/test';
import { advanceTo, newPhone, nightAct, revealAndAck, setupTable, skipRest, vote } from './helpers';

test('big moments: knife-cut card on TV and phones, pause after the vote, Mafia-left card after even rounds, grouped finale', async ({ browser }) => {
  test.setTimeout(600_000);
  const t = await setupTable(browser, 8, { mafia: 2, godfather: 1, doctor: 1, detective: 1, villager: 3 }, async (h) => {
    await h.getByLabel('Bollywood Mafia Night').click();
    const pause = h.getByLabel('Pause after the vote (seconds)');
    await pause.fill('8');
    await pause.press('Enter');
    await expect(pause).toHaveValue('8');
  });
  const tv = await newPhone(browser);
  await tv.setViewportSize({ width: 1280, height: 720 });
  await tv.goto(`/tv/${t.code}`);
  for (const s of t.seats) await revealAndAck(s);
  const [m1, m2] = t.byRole('Mafia');
  const vills = t.byRole('Villager');
  const doc = t.byRole('Doctor')[0];
  const det = t.byRole('Detective')[0];

  // Round 1: a night kill — the card is cut on the TV and on phones.
  await advanceTo(t, 'Night');
  await nightAct(m1, 'mafia_kill', vills[0].name);
  await nightAct(m2, 'mafia_kill', vills[0].name);
  await skipRest(t, new Set([m1.name, m2.name]));
  await expect(t.host.getByTestId('host-phase')).toHaveText('Day', { timeout: 60_000 });
  await expect(tv.getByTestId('tv-spotlight')).toContainText('Killed in the night');
  await expect(tv.getByTestId('moment-card')).toHaveAttribute('data-player', vills[0].name);
  await expect(det.page.getByTestId('phone-moment')).toContainText(vills[0].name);
  await advanceTo(t, 'Vote');
  for (const s of await t.alive()) await vote(s, s === vills[1] ? doc.name : vills[1].name);
  // The pause on the result (odd round: no Mafia count).
  await expect(t.host.getByTestId('host-phase')).toHaveText('Verdict', { timeout: 30_000 });
  await expect(tv.getByTestId('tv-spotlight')).toContainText('Voted out');
  await expect(tv.getByTestId('mafia-count')).toHaveCount(0);

  // Round 2: vote out a Mafia member → "1 Mafia still among you" (Badde Sahab doesn't count).
  await expect(t.host.getByTestId('host-phase')).toHaveText('Night', { timeout: 30_000 });
  await nightAct(m1, 'mafia_kill', vills[2].name);
  await nightAct(m2, 'mafia_kill', vills[2].name);
  await skipRest(t, new Set([m1.name, m2.name]));
  await expect(t.host.getByTestId('host-phase')).toHaveText('Day', { timeout: 60_000 });
  await advanceTo(t, 'Vote');
  for (const s of await t.alive()) await vote(s, s === m1 ? doc.name : m1.name);
  await expect(t.host.getByTestId('host-phase')).toHaveText('Verdict', { timeout: 30_000 });
  await expect(tv.getByTestId('mafia-count')).toContainText('1');
  await expect(det.page.getByTestId('mafia-count')).toContainText('1');

  // Round 3: the last Mafia member is voted out → the Town wins; the finale shows the Mafia first.
  await expect(t.host.getByTestId('host-phase')).toHaveText('Night', { timeout: 30_000 });
  await nightAct(m2, 'mafia_kill', doc.name);
  await skipRest(t, new Set([m2.name]));
  await expect(t.host.getByTestId('host-phase')).toHaveText('Day', { timeout: 60_000 });
  await advanceTo(t, 'Vote');
  for (const s of await t.alive()) await vote(s, s === m2 ? det.name : m2.name);
  await expect(t.host.getByTestId('host-phase')).toHaveText('Game Over', { timeout: 30_000 });
  // The finale show: full screen on the TV and on every phone, the Mafia first, big, with photos.
  await expect(tv.getByTestId('tv-finale')).toBeVisible();
  await expect(det.page.getByTestId('phone-finale')).toBeVisible();
  await expect(tv.getByTestId('tv-finale').locator('section').first()).toHaveAttribute('aria-label', 'The Mafia');
  await expect(tv.getByTestId('tv-finale').locator('.fc-mafia')).toHaveCount(3);
  await expect(tv.getByTestId('tv-finale').locator('.fc-mafia .fc-role')).toHaveCount(1); // only the Godfather is labelled
  if (process.env.SHOTS) {
    for (const [sec, name] of [[3.5, 'a'], [5, 'b'], [4.5, 'c'], [6, 'd']] as const) {
      await tv.waitForTimeout(sec * 1000);
      await tv.screenshot({ path: `${process.env.SHOTS}/tv-${name}.png` });
      await det.page.screenshot({ path: `${process.env.SHOTS}/phone-${name}.png` });
    }
  }
  // The phone's show ends by itself; the TV keeps the board, with the winner on top.
  await expect(det.page.getByTestId('phone-finale')).toHaveCount(0, { timeout: 30_000 });
  await expect(tv.getByTestId('tv-finale').getByRole('heading', { name: 'Gaon Wale Jeet Gaye!' })).toBeVisible({ timeout: 30_000 });
  // A phone that opens the page after the game ended goes straight to the results (no late replay).
  await det.page.reload();
  await expect(det.page.getByTestId('roles-revealed')).toBeVisible();
  await expect(det.page.getByTestId('phone-finale')).toHaveCount(0);
});
