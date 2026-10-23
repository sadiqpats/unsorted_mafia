import { expect, test } from '@playwright/test';
import { createRoom, newPhone } from './helpers';

test('players add photos; the TV wall shows them and cuts the photo of an eliminated player', async ({ browser }) => {
  const { host, code } = await createRoom(browser, 5);
  // A real image to "upload": a screenshot rendered by the browser.
  const painter = await newPhone(browser);
  await painter.setContent('<div style="width:300px;height:300px;background:linear-gradient(45deg,#c22a32,#c9a45c)"></div>');
  const png = await painter.screenshot({ clip: { x: 0, y: 0, width: 300, height: 300 } });

  const names = ['Ava', 'Ben', 'Cleo', 'Dev', 'Esme'];
  for (const name of names) {
    const p = await newPhone(browser);
    await p.goto(`/join/${code}`);
    await p.getByPlaceholder('What should the table call you?').fill(name);
    await p.getByTestId('photo-file').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png });
    await expect(p.getByRole('img', { name }).locator('img').first()).toBeVisible(); // preview
    await p.getByRole('button', { name: 'Join room' }).click();
    await p.getByRole('button', { name: 'I’m ready' }).click();
  }

  const tv = await newPhone(browser);
  await tv.goto(`/tv/${code}`);
  for (const name of names) {
    const img = tv.locator(`li[data-player="${name}"] img`).first();
    await expect(img).toBeVisible();
    expect(await img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(320); // resized on the phone
  }

  await host.getByRole('button', { name: 'Start the game' }).click();
  await expect(host.getByTestId('host-phase')).toHaveText('Role Reveal');
  await host.locator('li[data-player="Cleo"]').getByRole('button', { name: 'Eliminate' }).click();
  await host.getByRole('dialog').getByRole('button', { name: 'Eliminate' }).click();

  // If Cleo happened to be the only Mafia member, the game is over and the TV shows the final board.
  await expect(tv.locator('li[data-player="Cleo"][data-dead="true"], .fc[data-player="Cleo"]').first()).toBeVisible();
  if (await tv.getByTestId('tv-finale').isVisible()) {
    await expect(tv.locator('.fc[data-player="Cleo"] .fc-photo')).toHaveClass(/is-out/);
    await expect(tv.locator('.fc[data-player="Cleo"] img')).toBeVisible();
    return;
  }
  const cleo = tv.locator('li[data-player="Cleo"]');
  await expect(cleo).toHaveAttribute('data-dead', 'true');
  await expect(cleo.locator('.cut-photo')).toHaveClass(/is-dead/);
  await expect(cleo.getByRole('img', { name: 'Cleo (eliminated)' })).toBeVisible();
  await expect(tv.locator('li[data-player="Ava"] .cut-photo')).not.toHaveClass(/is-dead/);
  await tv.waitForTimeout(900); // let the cut animation finish for the screenshot
  await tv.screenshot({ path: 'test-results/tv-photo-wall.png', animations: 'disabled' });
});
