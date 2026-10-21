import { expect, type Browser, type Page } from '@playwright/test';
import { ROLES, ROLE_ORDER } from '../../src/shared/roles';

export interface Seat {
  name: string;
  page: Page;
  role?: string; // display name, e.g. "Doctor"
}

export interface Table {
  code: string;
  host: Page;
  seats: Seat[];
  seat: (name: string) => Seat;
  byRole: (role: string) => Seat[];
  alive: () => Promise<Seat[]>;
}

const nameRole = (roleName: string) => Object.values(ROLES).find((r) => r.name === roleName)!.id;

/** Each player gets their own isolated browser context — like separate phones. */
export async function newPhone(browser: Browser, { intro = false }: { intro?: boolean } = {}): Promise<Page> {
  const ctx = await browser.newContext();
  // The welcome intro shows once per visit; tests skip it unless they are testing it.
  if (!intro) await ctx.addInitScript(() => sessionStorage.setItem('mafia-night:intro-seen', '1'));
  // The Charades captain's card hides itself after 12 s untouched; keep it up during slow test runs.
  await ctx.addInitScript(() => ((window as unknown as { __CARD_HIDE_MS: number }).__CARD_HIDE_MS = 600_000));
  return ctx.newPage();
}

export async function createRoom(browser: Browser, count: number, { realClock = false }: { realClock?: boolean } = {}): Promise<{ host: Page; code: string }> {
  const host = await newPhone(browser);
  await host.goto('/host');
  await host.getByLabel('Host code').fill('e2e-host-code');
  await host.getByLabel('Your display name').fill('Gamemaster');
  await host.getByLabel('Type player count').fill(String(count));
  await host.getByRole('button', { name: 'Create room' }).click();
  await host.waitForURL(/\/r\/[A-Z0-9]{5}$/);
  const code = host.url().split('/').pop()!;
  await expect(host.getByText('Invite players')).toBeVisible();
  // No opening break before Dawn/Night in tests (its own test covers it) — keeps every phase instant.
  const brk = host.getByLabel('Break before Dawn & Night (seconds)');
  await brk.fill('0');
  await brk.press('Enter');
  await expect(brk).toHaveValue('0');
  const pause = host.getByLabel('Pause after the vote (seconds)');
  await pause.fill('0');
  await pause.press('Enter');
  await expect(pause).toHaveValue('0');
  // Long Night/Vote clocks so a slow, heavily loaded test machine never runs out the clock mid-test
  // (the real 60 s clock has its own test).
  if (!realClock) {
    for (const label of [/^Night \(seconds\)/, /^Vote \(seconds\)/]) {
      const box = host.getByLabel(label);
      await box.fill('600');
      await box.press('Enter');
      await expect(box).toHaveValue('600');
    }
    // No discussion clock either: the host opens every vote, so a slow test never gets a surprise vote.
    await host.getByText('No timer for discussion', { exact: true }).click();
    await expect(host.getByLabel(/No timer for discussion/)).toBeChecked();
  }
  return { host, code };
}

export async function joinRoom(browser: Browser, code: string, name: string): Promise<Page> {
  const page = await newPhone(browser);
  await page.goto(`/join/${code}`);
  await page.getByPlaceholder('What should the table call you?').fill(name);
  await expect(page.getByText(/’s room —/)).toBeVisible();
  await page.getByRole('button', { name: 'Join room' }).click();
  await page.waitForURL(new RegExp(`/r/${code}$`));
  await page.getByRole('button', { name: 'I’m ready' }).click();
  await expect(page.getByRole('button', { name: /Ready — tap to undo/ })).toBeVisible();
  return page;
}

/** Set exact role counts with the host's −/+ buttons. */
export async function setRoles(host: Page, counts: Record<string, number>) {
  for (const id of ROLE_ORDER) {
    const name = ROLES[id].name;
    const row = host.getByRole('group', { name: `${name} count` });
    const want = counts[id] ?? 0;
    for (let guard = 0; guard < 30; guard++) {
      const have = Number(await row.locator('span').innerText());
      if (have === want) break;
      await row.getByRole('button', { name: have < want ? `More ${name}` : `Fewer ${name}` }).click();
      await expect(row.locator('span')).toHaveText(String(have < want ? have + 1 : have - 1));
    }
  }
}

export async function setupTable(browser: Browser, count: number, roles?: Record<string, number>, before?: (host: Page) => Promise<void>, opts: { realClock?: boolean } = {}): Promise<Table> {
  const { host, code } = await createRoom(browser, count, opts);
  if (roles) await setRoles(host, roles);
  if (before) await before(host);
  const seats: Seat[] = [];
  for (let i = 1; i <= count; i++) seats.push({ name: `P${i}`, page: await joinRoom(browser, code, `P${i}`) });
  await expect(host.getByText(`${count} ready`)).toBeVisible();
  await host.getByRole('button', { name: 'Start the game' }).click();
  await expect(host.getByText('Role Reveal').first()).toBeVisible();
  // Host (Game Master) reveals roles on their own dashboard.
  await host.getByRole('button', { name: /Show roles/ }).click();
  for (const s of seats) {
    const shown = (await host.locator(`li[data-player="${s.name}"] [data-testid="role"]`).innerText()).trim();
    s.role = shown.match(/\(([^)]+)\)$/)?.[1] ?? shown; // Bollywood games show "Gabbar (Mafia)"
  }
  const table: Table = {
    code,
    host,
    seats,
    seat: (n) => seats.find((s) => s.name === n)!,
    byRole: (r) => seats.filter((s) => s.role === r),
    alive: async () => {
      const out: Seat[] = [];
      for (const s of seats) {
        const dead = await host.locator(`li[data-player="${s.name}"]`).getByText(/Killed at night|Voted out|Removed/).count();
        if (!dead) out.push(s);
      }
      return out;
    },
  };
  return table;
}

/** A player privately reveals their card (tap mode), checks it, and acknowledges. */
export async function revealAndAck(seat: Seat) {
  const p = seat.page;
  await p.getByLabel(/Tap instead of hold/).check();
  await p.getByRole('button', { name: /reveal/i }).first().click();
  const shown = (await p.locator('.flip-back h3').first().innerText()).trim();
  await p.getByRole('button', { name: /Your secret card/ }).click(); // hide again
  await p.getByRole('button', { name: 'I’ve seen my role' }).click();
  return shown;
}

export async function waitPhase(page: Page, phase: string) {
  await expect(page.locator('h1', { hasText: new RegExp(`^${phase}$`) })).toBeVisible();
}

/** Night: open the shared-looking privacy panel and act. target null = Skip. */
export async function nightAct(seat: Seat, abilityId: string, target: string | null) {
  const p = seat.page;
  const card = p.locator(`[data-option="${abilityId}"]`);
  // If this was the last choice of the night, the server resolves immediately and the panel disappears.
  const done = card.getByRole('button', { name: /✓ Locked|Change pick/ }).or(p.locator('h1', { hasText: /^(Day|Night|Game Over)$/ })).first();
  for (let attempt = 1; ; attempt++) {
    try {
      const open = p.getByRole('button', { name: /Open your (dawn|night) panel|Review your choice/ });
      if (await open.isVisible()) await open.click();
      if (target === null) {
        await card.getByRole('button', { name: 'Skip' }).click({ timeout: 8000 });
      } else {
        await card.getByRole('radio', { name: new RegExp(`^${target}( \\(you\\))?(\\s*🗡.*)?$`) }).click({ timeout: 8000 });
        await card.getByRole('button', { name: /Lock in|Change pick/ }).click({ timeout: 8000 });
      }
      await expect(done).toBeVisible({ timeout: 8000 });
      return;
    } catch (e) {
      if (await done.isVisible()) return;
      if (attempt >= 3) throw e;
    }
  }
}

/** Every alive seat with no explicit action skips everything, so the night resolves. */
export async function skipRest(t: Table, done: Set<string>) {
  for (const s of await t.alive()) {
    if (done.has(s.name)) continue;
    const p = s.page;
    // The phase can end the moment the last person acts (buttons vanish mid-click: fine), and the
    // secret panel closes itself after 15 s (reopen it). Loop until this player is locked in.
    const tap = (l: ReturnType<Page['locator']>) => l.click({ timeout: 8000 }).then(() => true, () => false);
    // Stay in the phase we started in: a Dawn skip must never leak into the Night that follows it.
    const phase = (await p.locator('h1', { hasText: /^(Dawn|Night)$/ }).first().innerText({ timeout: 2000 }).catch(() => '')).trim();
    if (!phase) continue;
    const samePhase = () => p.locator('h1', { hasText: new RegExp(`^${phase}$`, 'i') }).isVisible();
    for (let round = 0; round < 5; round++) {
      if (await p.getByText(/Locked in\. Put your phone face down/).isVisible()) break;
      if (!(await samePhase())) break; // phase moved on
      const open = p.getByRole('button', { name: /Open your (dawn|night) panel|Review your choice/ });
      if (await open.isVisible()) await tap(open);
      const skips = p.locator('[data-option]').getByRole('button', { name: 'Skip' });
      const n = await skips.count();
      for (let i = 0; i < n; i++) {
        if (!(await samePhase())) break;
        await tap(skips.first());
      }
      await p.waitForTimeout(150);
    }
  }
}

/**
 * Cast a secret ballot. The privacy shield auto-closes after 15s (by design), so on a
 * heavily loaded test machine we simply reopen it and retry.
 */
export async function vote(seat: Seat, target: string | null) {
  const p = seat.page;
  // The last vote ends the Day at once, so a phase change also proves the vote landed.
  const done = p.getByText('Your vote is in.').or(p.locator('h1', { hasText: /^(Dawn|Night|Verdict|Game Over)$/ })).first();
  for (let attempt = 1; ; attempt++) {
    try {
      const open = p.getByRole('button', { name: /Open your ballot|Review your vote/ });
      if (await done.isVisible()) return;
      if (await open.isVisible()) await open.click();
      if (target === null) await p.getByRole('radio', { name: 'No one (abstain)' }).click({ timeout: 8000 });
      else await p.getByRole('radio', { name: target, exact: true }).click({ timeout: 8000 });
      await p.getByRole('button', { name: /^Vote (for|to)/ }).click({ timeout: 8000 });
      await expect(done).toBeVisible({ timeout: 8000 });
      return;
    } catch (e) {
      if (await done.isVisible()) return;
      if (attempt >= 3) throw e;
    }
  }
}

export async function hostPhase(t: Table): Promise<string> {
  return (await t.host.getByTestId('host-phase').innerText()).trim();
}

/** Host presses "Next phase" until the given phase is reached. */
export async function advanceTo(t: Table, phase: string) {
  for (let i = 0; i < 8; i++) {
    const now = await hostPhase(t);
    if (now === phase) return;
    await t.host.getByRole('button', { name: /Next phase|Start voting/ }).click();
    await expect(t.host.getByTestId('host-phase')).not.toHaveText(now);
  }
  await expect(t.host.getByTestId('host-phase')).toHaveText(phase);
}

export { nameRole };

/** Host presses "Next phase" only if the phase is still the given one (it may have ended by itself). */
export async function nextIfStill(t: Table, phase: string) {
  if ((await hostPhase(t)) === phase) {
    await t.host.getByRole('button', { name: /Next phase|Start voting/ }).click();
    await expect(t.host.getByTestId('host-phase')).not.toHaveText(phase);
  }
}
