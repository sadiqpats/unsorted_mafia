import { expect, test } from '@playwright/test';
import { setupTable } from './helpers';

test("the Mafia's chat: a quiet bar from the role reveal, members with name, the Godfather as 'Godfather', nobody else sees it", async ({ browser }) => {
  test.setTimeout(300_000);
  const t = await setupTable(browser, 6, { mafia: 2, godfather: 1, villager: 3 });
  const [m1, m2] = t.byRole('Mafia');
  const gf = t.byRole('Godfather')[0];
  const vill = t.byRole('Villager')[0];

  // Right from the role reveal: one bar, closed.
  for (const s of [m1, m2, gf]) await expect(s.page.getByTestId('mafia-chat-bar')).toBeVisible();
  await expect(vill.page.getByTestId('mafia-chat-bar')).toHaveCount(0);

  await m1.page.getByTestId('mafia-chat-bar').click();
  await m1.page.getByLabel('Message').fill('Doctor first?');
  await m1.page.getByRole('button', { name: 'Send' }).click();
  await gf.page.getByTestId('mafia-chat-bar').click();
  await expect(gf.page.getByTestId('mafia-chat-msg')).toContainText(m1.name);
  // Typing shows inside the open chat: the Godfather only as "Godfather", a member by name.
  await m1.page.getByLabel('Message').fill('Tonight');
  await expect(gf.page.getByTestId('mafia-typing')).toHaveText(`${m1.name} is typing…`);
  await gf.page.getByLabel('Message').fill('Yes. Quietly.');
  await expect(m1.page.getByTestId('mafia-typing')).toHaveText('Godfather is typing…');
  await gf.page.getByRole('button', { name: 'Send' }).click();

  // The other member reads it only by opening the chat: no badge on the bar.
  await expect(m2.page.getByTestId('mafia-chat-bar')).toHaveText(/Family chat\s*tap to open/);
  await m2.page.getByTestId('mafia-chat-bar').click();
  const msgs = m2.page.getByTestId('mafia-chat-msg');
  await expect(msgs).toHaveCount(2);
  await expect(msgs.nth(0)).toContainText(m1.name);
  await expect(msgs.nth(1)).toContainText('Godfather says');
  await expect(msgs.nth(1)).not.toContainText(gf.name);
  if (process.env.SHOTS) await m2.page.screenshot({ path: `${process.env.SHOTS}/chat-open.png` });
  await m2.page.getByRole('button', { name: 'Close the chat' }).click();
  await expect(m2.page.getByTestId('mafia-chat-bar')).toBeVisible();
  if (process.env.SHOTS) await m2.page.screenshot({ path: `${process.env.SHOTS}/chat-bar.png` });
  await expect(vill.page.getByText('Yes. Quietly.')).toHaveCount(0);
});
