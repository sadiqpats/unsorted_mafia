import { expect, test } from '@playwright/test';
import { ROLES } from '../../src/shared/roles';
import { newPhone, setupTable } from './helpers';

test('a phone without a session cannot open the room or see secrets', async ({ browser }) => {
  const t = await setupTable(browser, 5);
  const stranger = await newPhone(browser);
  await stranger.goto(`/r/${t.code}`);
  await expect(stranger).toHaveURL(new RegExp(`/join/${t.code}$`));
  await expect(stranger.getByText('This game is already in progress.')).toBeVisible();

  // Forged token stored on the device → rejected by the server.
  await stranger.evaluate((code) => localStorage.setItem(`mafia-night:session:${code}`, JSON.stringify({ code, token: 'A'.repeat(43), kind: 'host', name: 'x' })), t.code);
  await stranger.goto(`/r/${t.code}`);
  await expect(stranger.getByText('Can’t open this room')).toBeVisible();

  // The public TV display shows no roles.
  const tv = await newPhone(browser);
  await tv.goto(`/tv/${t.code}`);
  await expect(tv.getByText('Role Reveal')).toBeVisible();
  const text = (await tv.locator('body').innerText()).replaceAll('Mafia Night', '');
  for (const r of Object.values(ROLES)) expect(text).not.toContain(r.name);
});

test('the network never delivers another player’s role to a phone', async ({ browser }) => {
  const t = await setupTable(browser, 8);
  const victim = t.seats.find((s) => s.role === 'Villager')!;
  // Capture every websocket frame a fresh session receives for this seat.
  const frames: string[] = [];
  victim.page.on('websocket', (ws) => ws.on('framereceived', (f) => typeof f.payload === 'string' && frames.push(f.payload)));
  await victim.page.reload();
  await expect(victim.page.getByRole('button', { name: 'I’ve seen my role' })).toBeVisible();
  const states = frames.filter((f) => f.startsWith('42["state"')).map((f) => JSON.parse(f.slice(2))[1]);
  expect(states.length).toBeGreaterThan(0);
  for (const v of states) {
    expect(v.host).toBeNull();
    expect(v.me.mafia).toBeNull();
    expect(v.me.allRoles).toBeNull();
    expect(v.players.every((p: { revealedRoleId: string | null }) => p.revealedRoleId === null)).toBe(true);
    expect(v.me.roleId).toBe('villager');
  }
});
