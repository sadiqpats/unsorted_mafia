import { expect, test } from '@playwright/test';
import { advanceTo, setupTable, vote, type Table } from './helpers';

/** The town votes out one Mafia member per day (nights pass with no action) until the Town wins. */
async function playToTownWin(t: Table) {
  for (let day = 1; day <= 10; day++) {
    await advanceTo(t, 'Day');
    const alive = await t.alive();
    const mafia = alive.filter((s) => s.role === 'Mafia'); // the Town wins once every Mafia member is dead
    const target = mafia[0];
    const scapegoat = alive.find((s) => s.role !== 'Mafia' && s.role !== 'Godfather' && s.role !== 'Jester')!;
    for (const s of alive) await vote(s, s === target ? scapegoat.name : target.name); // last vote ends the Day
    await expect(t.host.getByText(`The town has eliminated ${target.name}.`).first()).toBeVisible();
    if (mafia.length === 1) break;
  }
  for (const s of t.seats) await expect(s.page.getByText('The Town Prevails')).toBeVisible();
}

test('10-player game plays through to a Town victory', async ({ browser }) => {
  const t = await setupTable(browser, 10);
  expect(t.seats.filter((s) => s.role === 'Mafia')).toHaveLength(2);
  await playToTownWin(t);
});

test('26-player game (the maximum) plays through to a Town victory', async ({ browser }) => {
  test.setTimeout(900_000);
  const t = await setupTable(browser, 26);
  expect(t.seats.filter((s) => s.role === 'Mafia')).toHaveLength(6);
  expect(new Set(t.seats.map((s) => s.role)).size).toBe(9); // every character in play
  await playToTownWin(t);
});
