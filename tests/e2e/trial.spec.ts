import { expect, test } from '@playwright/test';
import { createRoom, joinRoom, newPhone } from './helpers';

test('trial run: bots fill the empty seats and play by themselves; the host just presses Next', async ({ browser }) => {
  test.setTimeout(600_000);
  const { host, code } = await createRoom(browser, 7);
  await host.getByLabel('Bollywood Mafia Night').click();
  const me = await joinRoom(browser, code, 'Sadiq'); // the one real phone
  const tv = await newPhone(browser);
  await tv.setViewportSize({ width: 1280, height: 720 });
  await tv.goto(`/tv/${code}`);
  await host.getByTestId('trial-run').click();
  await expect(host.getByText('Role Reveal').first()).toBeVisible();
  await expect(tv.locator('li[data-player]')).toHaveCount(7);
  // The phone sees its card like a real player.
  await me.getByLabel(/Tap instead of hold/).check();
  await me.getByRole('button', { name: /reveal/i }).first().click();
  await me.getByRole('button', { name: /Your secret card/ }).click();
  await me.getByRole('button', { name: 'I’ve seen my role' }).click();
  // Everyone has looked, but a trial run waits for the host's Next.
  await host.waitForTimeout(9000);
  await expect(host.getByTestId('host-phase')).toHaveText('Role Reveal');
  await host.getByRole('button', { name: /Next phase/ }).click();
  await expect(host.getByTestId('host-phase')).not.toHaveText('Role Reveal');
  // Keep pressing Next: bots act, vote, the game reaches an end.
  for (let i = 0; i < 60; i++) {
    const phase = (await host.getByTestId('host-phase').innerText()).trim();
    if (phase === 'Game Over') break;
    await host.waitForTimeout(phase === 'Night' || phase === 'Dawn' || phase === 'Vote' ? 8000 : 1500); // let the bots act
    const next = host.getByRole('button', { name: /Next phase|Start voting/ });
    if ((await host.getByTestId('host-phase').innerText()).trim() !== 'Game Over' && (await next.isEnabled().catch(() => false))) await next.click().catch(() => {});
    const tie = host.getByRole('button', { name: /Spare everyone|Nobody/ });
    if (await tie.isVisible().catch(() => false)) await tie.click().catch(() => {});
  }
  await expect(host.getByTestId('host-phase')).toHaveText('Game Over', { timeout: 30_000 });
  await expect(tv.getByTestId('tv-reveal')).toBeVisible();
  // Back to the lobby: the bots leave with the trial.
  await host.getByRole('button', { name: /Play again|Restart|Back to lobby|New game/ }).first().click();
  await expect(host.getByText('Invite players')).toBeVisible({ timeout: 15_000 });
  await expect(host.locator('li[data-player]')).toHaveCount(1);
});
