import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { advanceTo, nightAct, revealAndAck, setupTable, skipRest, vote } from './helpers';

test('home lights: the lights helper follows a game with “Playing at Elita home” on (dry run, no real bulbs)', async ({ browser }) => {
  test.setTimeout(300_000);
  const home = mkdtempSync(join(tmpdir(), 'lights-'));
  writeFileSync(join(home, '.unsorted-lights.json'), JSON.stringify({ hostCode: 'e2e-host-code', wizRoomId: 34855211 }));
  let log = '';
  const agent = spawn(process.execPath, ['scripts/lights.mjs', '--dry-run', '--server=http://localhost:4173'], { env: { ...process.env, HOME: home } });
  agent.stdout.on('data', (d) => (log += d.toString()));
  agent.stderr.on('data', (d) => (log += d.toString()));
  try {
    const t = await setupTable(browser, 5, { mafia: 1, doctor: 1, villager: 3 }, async (host) => {
      await host.getByLabel('Playing at Elita home').click();
      await expect(host.getByLabel('Playing at Elita home')).toBeChecked();
    });
    await expect.poll(() => log, { timeout: 30_000 }).toContain('Following room');
    for (const s of t.seats) await revealAndAck(s);
    await advanceTo(t, 'Night');
    await expect.poll(() => log, { timeout: 20_000 }).toContain('night');
    const m = t.byRole('Mafia')[0];
    const v = t.byRole('Villager')[0];
    await nightAct(m, 'mafia_kill', v.name);
    await skipRest(t, new Set([m.name]));
    await expect(t.host.getByTestId('host-phase')).toHaveText('Day', { timeout: 60_000 });
    await expect.poll(() => log, { timeout: 20_000 }).toContain('⚡ kill');
    await advanceTo(t, 'Vote');
    await expect.poll(() => log, { timeout: 20_000 }).toContain('vote');
    const other = t.byRole('Villager')[1];
    for (const s of await t.alive()) await vote(s, s === m ? other.name : m.name);
    await expect(t.host.getByTestId('host-phase')).toHaveText('Game Over', { timeout: 60_000 });
    await expect.poll(() => log, { timeout: 20_000 }).toContain('party');
  } finally {
    agent.kill('SIGINT');
    await new Promise((r) => setTimeout(r, 800));
    console.log('AGENT LOG\n' + log);
  }
});
