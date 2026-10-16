import { expect, test } from '@playwright/test';
import { advanceTo, hostPhase, newPhone, nightAct, revealAndAck, setupTable, skipRest, vote, waitPhase } from './helpers';

/** Set SHOTS_DIR to save host / phone / TV screenshots of every step for a visual check. */
const SHOTS = process.env.SHOTS_DIR;

test('full Bollywood game on the real clock (Night and Vote time out), with the TV, Godfather-is-Evil win rule', async ({ browser }) => {
  test.setTimeout(900_000);
  const t = await setupTable(browser, 6, { mafia: 1, godfather: 1, villager: 4 }, async (host) => {
    await host.getByLabel('Bollywood Mafia Night').click();
    await expect(host.getByLabel('Bollywood Mafia Night')).toBeChecked();
  }, { realClock: true });
  const tv = await newPhone(browser);
  await tv.setViewportSize({ width: 1280, height: 720 });
  await tv.goto(`/tv/${t.code}`);
  const shot = async (name: string) => {
    if (!SHOTS) return;
    await t.host.screenshot({ path: `${SHOTS}/${name}-host.png`, fullPage: true });
    await t.seats[0].page.screenshot({ path: `${SHOTS}/${name}-p1.png` });
    await tv.screenshot({ path: `${SHOTS}/${name}-tv.png` });
  };
  const mafia = t.byRole('Mafia')[0];
  const gf = t.byRole('Godfather')[0];
  const vills = t.byRole('Villager');
  for (const s of t.seats) await revealAndAck(s);

  // Dawn (nobody has dawn powers here, so it should end by itself or by the host).
  await shot('01-after-reveal');
  // Night 1: Gabbar kills a villager; everyone else lets the clock run out (60 s) — must still resolve.
  await waitPhase(mafia.page, 'Night').catch(async () => {
    await advanceTo(t, 'Night');
  });
  await shot('02-night');
  await nightAct(mafia, 'mafia_kill', vills[0].name);
  const t0 = Date.now();
  await expect(t.host.getByTestId('host-phase')).toHaveText('Day', { timeout: 90_000 });
  console.log(`night ended by clock after ${Math.round((Date.now() - t0) / 1000)} s`);
  await shot('03-day-discussion');
  await expect(t.seats[1].page.getByTestId('discussion')).toBeVisible();
  // No clock in discussion.
  await expect(t.host.getByRole('timer')).toHaveCount(0);
  await t.host.getByRole('button', { name: 'Start voting' }).click();
  await expect(t.host.getByTestId('host-phase')).toHaveText('Vote');
  await shot('04-vote');
  // Only two people vote; the rest time out (60 s). Vote out a villager.
  await vote(mafia, vills[1].name);
  await vote(gf, vills[1].name);
  const t1 = Date.now();
  await expect(t.host.getByTestId('host-phase')).not.toHaveText('Vote', { timeout: 90_000 });
  console.log(`vote ended by clock after ${Math.round((Date.now() - t1) / 1000)} s; now ${await hostPhase(t)}`);
  await shot('05-after-vote');
  // Now: Gabbar + Badde Sahab + 2 Gao Wallon → must play on (1 Mafia vs 3).
  await expect(t.host.getByTestId('host-phase')).not.toHaveText('Game Over');
  // Next night: Gabbar kills another villager → Gabbar + Badde Sahab + 1 villager: 1 vs 2, still on.
  await advanceTo(t, 'Night');
  await nightAct(mafia, 'mafia_kill', vills[2].name);
  await skipRest(t, new Set([mafia.name]));
  await expect(t.host.getByTestId('host-phase')).toHaveText('Day', { timeout: 90_000 });
  await shot('06-day2');
  await t.host.getByRole('button', { name: 'Start voting' }).click();
  for (const s of await t.alive()) await vote(s, s === vills[3] ? null : vills[3].name);
  await expect(t.host.getByTestId('host-phase')).toHaveText('Game Over', { timeout: 90_000 });
  await shot('07-game-over');
  await expect(t.seats[0].page.getByText(/Gabbar Ka Raaj/)).toBeVisible();
  await expect(tv.getByRole('heading', { name: 'Gabbar Ka Raaj' })).toBeVisible();
  await expect(tv.getByRole('heading', { name: 'Bollywood Mafia Night' })).toBeVisible();
});
