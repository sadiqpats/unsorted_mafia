import { expect, test } from '@playwright/test';
import { advanceTo, setupTable, vote, type Table } from './helpers';

/** The town votes out one Mafia member per day (nights pass with no action) until the Town wins. */
async function playToTownWin(t: Table) {
  for (let day = 1; day <= 10; day++) {
    await advanceTo(t, 'Voting');
    const alive = await t.alive();
    const mafia = alive.filter((s) => s.role === 'Mafia' || s.role === 'Godfather');
    const target = mafia[0];
    const scapegoat = alive.find((s) => s.role !== 'Mafia' && s.role !== 'Godfather' && s.role !== 'Jester')!;
    for (const s of alive) await vote(s, s === target ? scapegoat.name : target.name);
    await t.host.getByRole('button', { name: /Next phase/ }).click();
    await expect(t.host.getByText(`The town has eliminated ${target.name}.`).first()).toBeVisible();
    if (mafia.length === 1) break;
  }
  for (const s of t.seats) await expect(s.page.getByText('The Town Prevails')).toBeVisible();
}

test('10-player game plays through to a Town victory', async ({ browser }) => {
  const t = await setupTable(browser, 10);
  expect(t.seats.filter((s) => s.role === 'Mafia' || s.role === 'Godfather')).toHaveLength(3);
  await playToTownWin(t);
});

test('22-player game plays through to a Town victory', async ({ browser }) => {
  test.setTimeout(900_000);
  const t = await setupTable(browser, 22);
  expect(t.seats.filter((s) => s.role === 'Mafia' || s.role === 'Godfather')).toHaveLength(6);
  expect(new Set(t.seats.map((s) => s.role)).size).toBe(10); // every character in play
  await playToTownWin(t);
});
