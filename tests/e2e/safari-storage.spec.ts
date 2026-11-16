import { expect, test } from '@playwright/test';
import { createRoom } from './helpers';

// Safari with "Block all cookies" (and some in-app browsers) refuse to store anything.
// A player must still keep their seat after a reload or when the phone wakes up.
test('a phone that blocks storage keeps its seat after a reload', async ({ browser }) => {
  const { code } = await createRoom(browser, 5);
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    sessionStorage.setItem = () => undefined;
    Storage.prototype.setItem = function () {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });
  const p = await ctx.newPage();
  await p.goto(`/join/${code}`);
  await p.getByPlaceholder('What should the table call you?').fill('Safari');
  await expect(p.getByText(/’s room —/)).toBeVisible();
  await p.getByRole('button', { name: 'Join room' }).click();
  await p.waitForURL(new RegExp(`/r/${code}#s=`));
  await p.getByRole('button', { name: 'I’m ready' }).click();
  await expect(p.getByRole('button', { name: /Ready — tap to undo/ })).toBeVisible();
  await p.reload();
  await expect(p.getByRole('button', { name: /Ready — tap to undo/ })).toBeVisible({ timeout: 15_000 });
  await expect(p).toHaveURL(new RegExp(`/r/${code}`));
});

test('a normal phone keeps its seat after a reload (no address trick needed)', async ({ browser }) => {
  const { code } = await createRoom(browser, 5);
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => sessionStorage.setItem('mafia-night:intro-seen', '1'));
  const p = await ctx.newPage();
  await p.goto(`/join/${code}`);
  await p.getByPlaceholder('What should the table call you?').fill('Chrome');
  await p.getByRole('button', { name: 'Join room' }).click();
  await p.waitForURL(new RegExp(`/r/${code}$`));
  await p.reload();
  await expect(p.getByRole('button', { name: 'I’m ready' })).toBeVisible({ timeout: 15_000 });
});
