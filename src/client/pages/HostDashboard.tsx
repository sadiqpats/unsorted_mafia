import { useEffect, useState, type ReactNode } from 'react';
import { suggestDistribution } from '../../shared/distribution';
import { ABILITIES, ROLES, ROLE_ORDER, roleAlignment, roleArt, roleTitle } from '../../shared/roles';
import type { Settings, SettingsPatch } from '../../shared/settings';
import type { ClientView } from '../../shared/view-types';
import { PlayerCountInput } from '../components/PlayerCountInput';
import { RoleArt } from '../components/RoleArt';
import { AlignmentBadge, Feed, Modal, PHASE_LABEL, PlayerRow, Progress, QR, Section, Timer, Toggle, useConfirm, useToast } from '../components/ui';
import { GameOverPanel, PlayerGame, useAct, type GameProps } from './PlayerGame';

export function HostDashboard(props: GameProps) {
  const { view } = props;
  const playing = !!view.me;
  const [tab, setTab] = useState<'control' | 'seat'>(playing ? 'seat' : 'control');
  return (
    <div className="space-y-4">
      {playing && (
        <div className="card flex gap-1 p-1" role="tablist" aria-label="Host views">
          {(['seat', 'control'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={`btn flex-1 !min-h-10 ${tab === t ? 'btn-gold' : 'btn-ghost !border-transparent'}`} onClick={() => setTab(t)}>
              {t === 'seat' ? 'My seat' : 'Host controls'}
            </button>
          ))}
        </div>
      )}
      {playing && tab === 'seat' ? <PlayerGame {...props} /> : view.status === 'lobby' || !view.game ? <HostLobby {...props} /> : <HostGame {...props} />}
    </div>
  );
}

// =================================================================== lobby

function HostLobby({ view, send }: GameProps) {
  const { act, busy } = useAct(send);
  const confirm = useConfirm();
  const toast = useToast();
  const s = view.settings;
  const d = view.distribution;
  const joinUrl = `${window.location.origin}/join/${view.code}`;
  const notReady = view.players.filter((p) => !p.ready);
  const patch = (p: SettingsPatch) => act({ type: 'update_settings', patch: p });
  const full = view.players.length === s.playerCount;

  const start = async () => {
    let force = false;
    if (notReady.length) {
      force = await confirm({ title: 'Start without everyone ready?', body: `${notReady.map((p) => p.name).join(', ')} ${notReady.length === 1 ? 'has' : 'have'} not tapped Ready.`, confirm: 'Start anyway' });
      if (!force) return;
    }
    await act({ type: 'start', force }, 'The game has begun!');
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <div className="space-y-4">
        <Section title="Invite players">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <QR text={joinUrl} size={168} />
            <div className="w-full min-w-0 flex-1 text-center sm:text-left">
              <p className="text-xs text-mute">Room code</p>
              <p className="font-[family-name:var(--font-display)] text-4xl tracking-[0.3em]">{view.code}</p>
              <p className="mt-2 break-all text-xs text-mute">{joinUrl}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                <button
                  className="btn btn-ghost !min-h-10 text-sm"
                  onClick={() => navigator.clipboard?.writeText(joinUrl).then(() => toast('Invite link copied.'), () => toast('Copy failed — share the code instead.', 'error'))}
                >
                  Copy invite link
                </button>
                <a className="btn btn-ghost !min-h-10 text-sm" href={`/tv/${view.code}`} target="_blank" rel="noreferrer">
                  Open TV display ↗
                </a>
              </div>
            </div>
          </div>
        </Section>

        <Section title={`Players ${view.players.length}/${s.playerCount}`} aside={<span className="text-xs text-mute">{view.players.filter((p) => p.ready).length} ready</span>}>
          {view.players.length === 0 ? (
            <p className="text-sm text-mute">Nobody yet. Share the QR code or the room code.</p>
          ) : (
            <ul className="space-y-2">
              {view.players.map((p) => (
                <PlayerRow
                  key={p.id}
                  className="anim-slide-in"
                  p={p}
                  sub={<span>{p.ready ? '✓ Ready' : 'Not ready'}</span>}
                  right={
                    !p.isHost && (
                      <div className="flex gap-1">
                        {p.photo && (
                          <button
                            className="btn btn-ghost !min-h-9 !px-2 !py-1 text-xs"
                            onClick={async () => (await confirm({ title: `Remove ${p.name}'s photo?`, body: 'Use this for inappropriate photos. They can upload a new one.', confirm: 'Remove photo', danger: true })) && act({ type: 'remove_photo', playerId: p.id }, 'Photo removed.')}
                          >
                            Remove photo
                          </button>
                        )}
                      <button
                        className="btn btn-danger !min-h-9 !px-3 !py-1 text-xs"
                        onClick={async () => (await confirm({ title: `Remove ${p.name}?`, body: 'They will be disconnected and must rejoin with the code.', confirm: 'Remove', danger: true })) && act({ type: 'kick', playerId: p.id }, `${p.name} removed.`)}
                      >
                        Remove
                      </button>
                      </div>
                    )
                  }
                />
              ))}
            </ul>
          )}
        </Section>

        <div className="card space-y-3 p-4">
          {d.errors.map((e) => (
            <p key={e} role="alert" className="text-sm text-ember">
              ⚠ {e}
            </p>
          ))}
          {d.warnings.map((w) => (
            <p key={w} className="text-sm text-gold">
              ⚠️ {w}
            </p>
          ))}
          {!full && <p className="text-sm text-mute">Waiting for {s.playerCount - view.players.length} more player(s)…</p>}
          {!full && view.players.length >= 5 && (
            <button className="btn btn-ghost w-full text-sm" disabled={busy} onClick={() => patch({ playerCount: view.players.length })}>
              Start with the {view.players.length} players here (re-deal roles)
            </button>
          )}
          <button className="btn btn-primary w-full text-lg" disabled={busy || !full || d.errors.length > 0} onClick={start}>
            Start the game
          </button>
          {!full && d.errors.length === 0 && (
            <button
              className="btn btn-ghost w-full border-dashed text-sm"
              disabled={busy}
              data-testid="trial-run"
              onClick={() => act({ type: 'start_trial' })}
              title="Fill the empty seats with bots that play by themselves, and start. Nothing moves on until you press Next — to check the TV, a phone, the lights and the music."
            >
              🧪 Trial run — fill {view.settings.playerCount - view.players.length} empty seat{view.settings.playerCount - view.players.length === 1 ? '' : 's'} with bots and start
            </button>
          )}
          <div className="flex gap-2">
            <button
              className="btn btn-danger flex-1 text-sm"
              onClick={async () => (await confirm({ title: 'Close this room?', body: 'Everyone is disconnected and the room code stops working. This cannot be undone.', confirm: 'Close room', danger: true })) && act({ type: 'close_room' })}
            >
              Close room
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <Section title="Players & characters">
          <PlayerCountInput value={s.playerCount} min={Math.max(5, view.players.length)} onChange={(n) => patch({ playerCount: n })} />
          <RoleEditor view={view} onChange={(roles) => patch({ roles })} />
        </Section>
        <HouseRules s={s} patch={patch} send={send} view={view} />
      </div>
    </div>
  );
}

function RoleEditor({ view, onChange }: { view: ClientView; onChange: (r: Record<string, number>) => void }) {
  const s = view.settings;
  const d = view.distribution;
  const set = (id: string, n: number) => onChange({ ...s.roles, [id]: Math.max(0, n) });
  return (
    <div className="mt-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="chip text-good">🛡️ Town {d.byAlignment.good}</span>
        <span className="chip text-ember">🗡 Mafia {d.byAlignment.mafia}</span>
        {d.byAlignment.evil > 0 && <span className="chip text-[#e07ac8]">😈 Evil {d.byAlignment.evil}</span>}
        <span className="chip text-neutral">◆ Neutral {d.byAlignment.neutral}</span>
        <span className={`chip ${d.total === s.playerCount ? 'text-ok' : 'text-ember'}`}>
          {d.total}/{s.playerCount} roles
        </span>
        <button className="ml-auto text-gold underline underline-offset-4" onClick={() => onChange(suggestDistribution(s.playerCount))}>
          Use suggested
        </button>
      </div>
      <ul className="space-y-2">
        {ROLE_ORDER.map((id) => {
          const r = ROLES[id];
          const c = s.roles[id] ?? 0;
          const a = roleAlignment(id, s);
          return (
            <li key={id} className={`flex items-center gap-3 rounded-xl border p-2 ${c > 0 ? 'border-line' : 'border-line/40 opacity-70'}`}>
              <RoleArt art={roleArt(id, s)} alignment={a} size={40} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {roleTitle(id, s)} {r.unique && <span className="text-[0.65rem] text-mute">(max 1)</span>}
                </div>
                <div className="text-xs text-mute">
                  <AlignmentBadge alignment={a} />
                </div>
              </div>
              <div className="flex items-center gap-1" role="group" aria-label={`${r.name} count`}>
                <button className="btn btn-ghost !min-h-10 !w-10 !p-0" aria-label={`Fewer ${r.name}`} disabled={c === 0} onClick={() => set(id, c - 1)}>
                  −
                </button>
                <span className="w-7 text-center tabular-nums" aria-live="polite">
                  {c}
                </span>
                <button className="btn btn-ghost !min-h-10 !w-10 !p-0" aria-label={`More ${r.name}`} disabled={(r.unique && c >= 1) || c >= s.playerCount} onClick={() => set(id, c + 1)}>
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NumberSetting({ label, value, min, max, onChange, suffix = 's' }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; suffix?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(text));
    if (Number.isFinite(n) && n >= min && n <= max) n !== value && onChange(n);
    else setText(String(value));
  };
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 px-2">
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-1">
        <input className="field !min-h-10 !w-20 !py-1 text-center" type="number" min={min} max={max} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
        <span className="w-4 text-xs text-mute">{suffix}</span>
      </span>
    </label>
  );
}

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 px-2">
      <span className="text-sm">{label}</span>
      <select className="field !min-h-10 !w-auto max-w-[55%] !py-1 text-sm" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Group({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="group rounded-xl border border-line/60 bg-black/20" open={open}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-3 font-medium">
        {title}
        <span className="text-mute transition group-open:rotate-180" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="space-y-0.5 pb-2">{children}</div>
    </details>
  );
}

function HouseRules({ s, patch, send, view }: { s: Settings; patch: (p: SettingsPatch) => void; send: GameProps['send']; view: ClientView }) {
  const { act } = useAct(send);
  const vp = s.villagerPowers;
  const vpCount = [vp.hunch, vp.shield, vp.rally].filter(Boolean).length;
  const ann = s.announcements;
  return (
    <Section title="House rules">
      <p className="mb-3 text-xs text-mute">Rules lock when the game starts, so they can never change mid-match.</p>
      <div className="mb-4" role="radiogroup" aria-label="Where are you playing?">
        <p className="mb-2 text-sm font-medium">Where are you playing?</p>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['offline', '🏠 Together (offline)', 'Same room. No music on phones; sound effects play on your device and the TV.'],
              ['online', '🌐 Online', 'Players apart. Suspense music at Dawn & Night, and every sound on every phone.'],
            ] as const
          ).map(([mode, label, hint]) => (
            <button
              key={mode}
              role="radio"
              aria-checked={s.playMode === mode}
              onClick={() => patch({ playMode: mode })}
              className={`rounded-xl border p-3 text-left text-sm transition ${s.playMode === mode ? 'border-gold bg-gold/10' : 'border-line bg-black/20 hover:border-gold/50'}`}
            >
              <span className="block font-semibold">{label}</span>
              <span className="mt-1 block text-xs text-mute">{hint}</span>
            </button>
          ))}
        </div>
        {s.playMode !== 'online' && (
          <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-black/20 p-3">
            <span>
              <span className="block font-semibold">💡 Playing at Elita home?</span>
              <span className="mt-0.5 block text-xs text-mute">The living-room lights and the Living room Echo follow the game: sunrise at Dawn, red at Night, soft gold for the Day, a red heartbeat for the vote, suspense music and dramatic sounds. Needs the home helper running on the Mac.</span>
            </span>
            <input type="checkbox" className="h-6 w-6 shrink-0 accent-[#c9a45c]" aria-label="Playing at Elita home" checked={!!s.homeLights} onChange={(e) => patch({ homeLights: e.target.checked })} />
          </label>
        )}
        {s.playMode !== 'online' && s.homeLights && <EchoVolumes view={view} send={send} />}
      </div>
      <label className="mb-4 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gradient-to-r from-[#3a0f2a]/60 to-[#2a1606]/60 p-3">
        <span>
          <span className="block font-semibold">🎬 Bollywood Mafia Night</span>
          <span className="mt-0.5 block text-xs text-mute">Every character becomes a Bollywood legend — Gabbar (Mafia), Badde Sahab (Godfather), Munna MBBS (Doctor)… with their own illustrations. Same rules and powers.</span>
        </span>
        <input type="checkbox" className="h-6 w-6 shrink-0 accent-[#e0473f]" aria-label="Bollywood Mafia Night" checked={!!s.bollywood} onChange={(e) => patch({ bollywood: e.target.checked })} />
      </label>
      <div className="space-y-2">
        <Group title="Timers" open>
          <p className="text-xs text-mute">Dawn and Night start with a short break so the news can land. When the discussion’s clock runs out the vote opens by itself (you can also press “Start voting” early). Anything not chosen in time simply doesn’t count.</p>
          <Toggle label="No timers at all" hint="No clocks anywhere: a phase ends when everyone has acted, or when you press Next." checked={s.timers === false} onChange={(v) => patch({ timers: !v })} />
          <NumberSetting label="Dawn (seconds)" value={s.preNightSeconds} min={10} max={300} onChange={(v) => patch({ preNightSeconds: v })} />
          <NumberSetting label="Night (seconds)" value={s.nightSeconds} min={15} max={600} onChange={(v) => patch({ nightSeconds: v })} />
          <Select
            label="Discussion"
            value={String(s.daySeconds ?? 240)}
            options={[...new Set([120, 150, 180, 210, 240, 270, 300, 360, s.daySeconds ?? 240])].sort((a, b) => a - b).map((n) => [String(n), `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')} min`] as [string, string])}
            onChange={(v) => patch({ daySeconds: Number(v) })}
          />
          <Toggle label="No timer for discussion" hint="The discussion is open-ended: you press “Start voting” when the table is ready." checked={s.discussionTimer === false} onChange={(v) => patch({ discussionTimer: !v })} />
          <NumberSetting label="Vote (seconds)" value={s.voteSeconds ?? 30} min={15} max={600} onChange={(v) => patch({ voteSeconds: v })} />
          <NumberSetting label="Break before Dawn & Night (seconds)" value={s.bufferSeconds ?? 5} min={0} max={15} onChange={(v) => patch({ bufferSeconds: v })} />
          <NumberSetting label="Pause after the vote (seconds)" value={s.verdictSeconds ?? 8} min={0} max={20} onChange={(v) => patch({ verdictSeconds: v })} />
        </Group>
        <Group title="Flow">
          <Toggle
            label="Dawn round"
            hint="Thief steals and Imposter revives at Dawn, before each night. Runs only if one of them is in the game."
            checked={s.preNightRound}
            onChange={(v) => patch({ preNightRound: v })}
          />
          <Toggle label="I’m also playing" hint="Hides every secret from this dashboard." checked={s.hostPlays} onChange={(v) => act({ type: 'set_host_plays', hostPlays: v })} />
          <Toggle label="Allow late joining" hint="Late joiners always become Villagers." checked={s.allowLateJoin} onChange={(v) => patch({ allowLateJoin: v })} />
        </Group>
        <Group title="Voting">
          <Toggle label="Players may change their vote" hint="The vote then runs until its clock ends (or you press Next phase)." checked={s.allowVoteChange} onChange={(v) => patch({ allowVoteChange: v })} />
          <Toggle label="Allow voting for yourself" checked={s.allowSelfVote} onChange={(v) => patch({ allowSelfVote: v })} />
          <Toggle label="Allow abstaining" checked={s.allowAbstain} onChange={(v) => patch({ allowAbstain: v })} />
          <Toggle label="Silenced players can still vote" hint="They must stay quiet in discussion either way." checked={s.silencedCanVote} onChange={(v) => patch({ silencedCanVote: v })} />
          <Select label="On a tie" value={s.tieRule} options={[['none', 'Nobody is eliminated'], ['runoff', 'Runoff vote'], ['host', 'Host decides']]} onChange={(v) => patch({ tieRule: v })} />
          <Select label="Reveal after voting" value={s.voteReveal} options={[['outcome', 'Outcome only'], ['tally', 'Vote totals'], ['full', 'Who voted for whom']]} onChange={(v) => patch({ voteReveal: v })} />
          <NumberSetting label="Judge vote weight" value={s.judgeWeight} min={1} max={5} suffix="×" onChange={(v) => patch({ judgeWeight: v })} />
        </Group>
        <Group title="Information">
          <Toggle label="Reveal role when a player dies" hint="Off (default): every role stays secret until the game is over." checked={s.revealRoleOnDeath} onChange={(v) => patch({ revealRoleOnDeath: v })} />
          <Toggle label="Announce when someone is saved" checked={s.announceSaves} onChange={(v) => patch({ announceSaves: v })} />
          <Toggle label="Announce who is silenced" checked={s.announceSilenced} onChange={(v) => patch({ announceSilenced: v })} />
          <Toggle label="Dead players can see all roles" hint="Off is safer: ghosts can’t leak with their faces." checked={s.deadCanSeeRoles} onChange={(v) => patch({ deadCanSeeRoles: v })} />
          <Select label="Detective learns" value={s.detectiveResult} options={[['binary', 'Suspicious / not'], ['alignment', 'Exact alignment']]} onChange={(v) => patch({ detectiveResult: v })} />
        </Group>
        <Group title="Mafia & Godfather">
          <Select label="Mafia kill decision" value={s.mafiaDecision} options={[['plurality', 'Most picks'], ['leader', 'First-seated Mafia decides']]} onChange={(v) => patch({ mafiaDecision: v })} />
          <Select label="Mafia win when Mafia members" value={s.mafiaWin} options={[['parity', 'equal the rest (Godfather not counted)'], ['majority', 'outnumber the rest']]} onChange={(v) => patch({ mafiaWin: v })} />
          <Toggle label="Family chat for the Mafia" hint="A secret chat on the Mafia members’ phones (not the Godfather’s). Off: no chat at all." checked={s.mafiaChat} onChange={(v) => patch({ mafiaChat: v })} />
          <Toggle label="Godfather appears innocent to the Detective" checked={s.godfatherAppearsInnocent} onChange={(v) => patch({ godfatherAppearsInnocent: v })} />
          <Toggle label="Godfather’s Superpower (Mahastra)" hint="Best with 16 or more players. Once per game, at Dawn, he can choose to kill two people that night himself; the Mafia sit that night out. The Thief can’t steal it. Adds a Dawn round to every round." checked={s.godfatherSuperpower} onChange={(v) => patch({ godfatherSuperpower: v })} />
          <Toggle label="Godfather can silence anyone, himself included" hint="Off: anyone except himself." checked={s.godfatherSilenceSelf} onChange={(v) => patch({ godfatherSilenceSelf: v })} />
          <Toggle label="Godfather takes over when every Mafia member is dead" hint="He makes the night kill himself, and the game goes on until he is caught." checked={s.godfatherTakesOver} onChange={(v) => patch({ godfatherTakesOver: v })} />
        </Group>
        <Group title="Doctor">
          <Select
            label="Doctor saving themselves"
            value={s.doctorSelfProtect}
            options={[['alternate', 'Allowed, not two rounds in a row'], ['always', 'Always allowed'], ['never', 'Never']]}
            onChange={(v) => patch({ doctorSelfProtect: v })}
          />
          <Toggle label="No same person two nights in a row" hint="The Doctor can't save, and the Godfather can't silence, the same person on two nights running — every other night is fine." checked={s.noRepeatTargets} onChange={(v) => patch({ noRepeatTargets: v })} />
        </Group>
        <Group title="Revivals (Imposter)">
          <Toggle label="Revived players keep their role" checked={s.revivedKeepRole} onChange={(v) => patch({ revivedKeepRole: v })} />
          <Toggle label="Revived players keep status effects" checked={s.revivedKeepEffects} onChange={(v) => patch({ revivedKeepEffects: v })} />
          <Toggle label="Revived players can vote the next day" checked={s.revivedCanActNextPhase} onChange={(v) => patch({ revivedCanActNextPhase: v })} />
        </Group>
        <Group title="Thief">
          <Select label="Thief’s side" value={s.thiefAlignment} options={[['neutral', 'Neutral'], ['good', 'Town']]} onChange={(v) => patch({ thiefAlignment: v })} />
          <Toggle label="Can steal the Judge’s double vote" checked={s.thiefStealPassive} onChange={(v) => patch({ thiefStealPassive: v })} />
          <p className="px-2 pb-1 text-xs text-mute">Every Dawn the Thief picks a power (never a person). It lasts that round; the same power can’t be taken two rounds in a row.</p>
        </Group>
        <Group title="Imposter">
          <Select label="Imposter’s side" value={s.imposterAlignment} options={[['neutral', 'Neutral'], ['good', 'Town'], ['mafia', 'Mafia']]} onChange={(v) => patch({ imposterAlignment: v })} />
          <NumberSetting label="Revivals (0 = unlimited)" value={s.imposterCharges} min={0} max={10} suffix="" onChange={(v) => patch({ imposterCharges: v })} />
        </Group>
        <Group title="Joker">
          <Toggle label="Joker’s win ends the game" hint="Off: the Joker is credited and play continues." checked={s.jesterEndsGame} onChange={(v) => patch({ jesterEndsGame: v })} />
        </Group>
        <Group title={`Villager optional powers (${vpCount}/2)`}>
          <p className="px-2 pb-1 text-xs text-mute">Suggestions, off by default. Each is once per game. Max two.</p>
          <Toggle label={`${ABILITIES.v_hunch.name}: learn if someone has a night power`} checked={vp.hunch} disabled={!vp.hunch && vpCount >= 2} onChange={(v) => patch({ villagerPowers: { hunch: v } })} />
          <Toggle label={`${ABILITIES.v_shield.name}: protect yourself one night`} checked={vp.shield} disabled={!vp.shield && vpCount >= 2} onChange={(v) => patch({ villagerPowers: { shield: v } })} />
          <Toggle label={`${ABILITIES.v_rally.name}: one double-weight vote`} checked={vp.rally} disabled={!vp.rally && vpCount >= 2} onChange={(v) => patch({ villagerPowers: { rally: v } })} />
        </Group>
        <Group title="Announcement wording">
          <p className="px-2 pb-1 text-xs text-mute">Use {'{name}'} for the player’s name.</p>
          {(Object.keys(ann) as (keyof typeof ann)[]).map((k) => (
            <TextSetting key={k} label={k} value={ann[k]} onChange={(v) => patch({ announcements: { [k]: v } })} />
          ))}
        </Group>
      </div>
      <p className="mt-3 text-xs text-mute">Room {view.code} · settings save instantly.</p>
    </Section>
  );
}

function TextSetting({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="block px-2 py-1">
      <span className="text-xs text-mute">{label}</span>
      <input className="field !min-h-10 !py-1 text-sm" value={text} maxLength={160} onChange={(e) => setText(e.target.value)} onBlur={() => text.trim() && text !== value && onChange(text)} />
    </label>
  );
}

// =================================================================== in game

function HostGame({ view, send, serverNow }: GameProps) {
  const g = view.game!;
  const h = view.host!;
  const { act, busy } = useAct(send);
  const confirm = useConfirm();
  const [showRoles, setShowRoles] = useState(false);
  // An awake laptop on the table must not keep every role on screen: hide again after 30 seconds.
  useEffect(() => {
    if (!showRoles) return;
    const t = setTimeout(() => setShowRoles(false), 30_000);
    return () => clearTimeout(t);
  }, [showRoles]);
  const [rejoin, setRejoin] = useState<{ name: string; code: string } | null>(null);
  const [msg, setMsg] = useState('');
  const over = g.phase === 'game_over';
  const roleName = (id: string) => (h.roles ? roleTitle(h.roles[id], view.settings) : null);
  const nameOf = (id: string | null) => (id ? (view.players.find((p) => p.id === id)?.name ?? '?') : 'skip');

  const progress = g.nightProgress ?? g.votingProgress ?? g.revealProgress;

  const playAgain = (
    <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
      <button className="btn btn-primary" disabled={busy} onClick={() => act({ type: 'restart' }, 'Back to the lobby.')}>
        Play again (same players)
      </button>
      <a className="btn btn-ghost" href="/host">
        New room
      </a>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Control bar */}
      <div className={`card phase-card phase-${g.phase} z-30 p-3 md:sticky md:top-16`}>
        <div className="flex items-center gap-3">
          <div className="mr-auto">
            <div className="eyebrow">{g.round ? `Round ${g.round}` : 'Start'}</div>
            <div className="font-[family-name:var(--font-display)] text-xl" data-testid="host-phase">
              {PHASE_LABEL[g.phase]}
            </div>
          </div>
          <Timer endsAt={g.phaseEndsAt} opensAt={g.phaseOpensAt} serverNow={serverNow} pausedMs={g.pausedRemainingMs} />
        </div>
        {progress && progress.total > 0 && (
          <Progress className="mt-2" done={progress.done} total={progress.total} label={g.nightProgress ? 'Locked in' : g.votingProgress ? 'Votes in' : 'Seen their role'} />
        )}
        {!over && (
          <div className="mt-3 flex flex-wrap gap-2 sm:flex-nowrap">
            {g.phaseEndsAt !== null && (
              <>
                <button className="btn btn-ghost !min-h-11 flex-1 text-sm sm:flex-none" disabled={busy} onClick={() => act({ type: 'extend', seconds: -30 })} aria-label="Remove 30 seconds">
                  −30s
                </button>
                <button className="btn btn-ghost !min-h-11 flex-1 text-sm sm:flex-none" disabled={busy} onClick={() => act({ type: 'extend', seconds: 30 })} aria-label="Add 30 seconds">
                  +30s
                </button>
              </>
            )}
            <button className="btn btn-ghost !min-h-11 flex-1 text-sm sm:flex-none" disabled={busy} onClick={() => act({ type: g.paused ? 'resume' : 'pause' })}>
              {g.paused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button className="btn btn-gold !min-h-11 basis-full text-base sm:ml-auto sm:basis-auto sm:px-8" disabled={busy || !!g.pendingTie} onClick={() => act({ type: 'advance', phaseSeq: g.phaseSeq })}>
              {g.phase === 'discussion' ? '🗳️ Start voting' : 'Next phase ⏭'}
            </button>
          </div>
        )}
      </div>

      {!h.secrets && (
        <p className="rounded-xl border border-gold/40 bg-gold/5 p-3 text-sm">
          You are playing, so this dashboard shows <b>no secret information</b>. The app resolves the night and counts the votes for you.
        </p>
      )}

      {g.phase === 'voting' && view.settings.allowVoteChange && g.votingProgress && g.votingProgress.total > 0 && g.votingProgress.done === g.votingProgress.total && (
        <div className="anim-pop rounded-xl border border-ok/50 bg-ok/10 p-3 text-center text-sm" role="status">
          ✅ All votes are in. Press <b>Next phase</b> to reveal the result (players can still change their vote until you do).
        </div>
      )}

      {g.pendingTie && (
        <Section title="Break the tie" className="border-gold/60">
          <p className="mb-3 text-sm text-mute">The vote is tied. Choose who is eliminated, or spare everyone.</p>
          <div className="flex flex-wrap gap-2">
            {g.pendingTie.map((id) => (
              <button key={id} className="btn btn-primary" disabled={busy} onClick={() => act({ type: 'resolve_tie', targetId: id })}>
                Eliminate {nameOf(id)}
              </button>
            ))}
            <button className="btn btn-ghost" disabled={busy} onClick={() => act({ type: 'resolve_tie', targetId: null })}>
              Spare everyone
            </button>
          </div>
        </Section>
      )}

      {over && <GameOverPanel view={{ ...view, me: null }} serverNow={serverNow} hostControls={playAgain} />}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          <Section
            title="Players"
            aside={
              h.secrets && (
                <button className="btn btn-ghost !min-h-9 !px-3 !py-1 text-xs" aria-pressed={showRoles} onClick={() => setShowRoles((s) => !s)}>
                  {showRoles ? '🙈 Hide roles' : '👁 Show roles'}
                </button>
              )
            }
          >
            <ul className="space-y-2">
              {view.players.map((p) => {
                const night = h.nightSubmitted[p.id];
                const voted = h.voteSubmitted[p.id];
                return (
                  <PlayerRow
                    key={p.id}
                    p={p}
                    sub={
                      <>
                        {showRoles && h.roles && (
                          <span className="text-gold" data-testid="role">
                            {roleName(p.id)}
                          </span>
                        )}
                        {(g.phase === 'night' || g.phase === 'prenight') && night !== undefined && <span className={night ? 'text-ok' : ''}>{night ? '✓ acted' : '… thinking'}</span>}
                        {g.phase === 'voting' && voted !== undefined && <span className={voted ? 'text-ok' : ''}>{voted ? '✓ voted' : '… not voted'}</span>}
                      </>
                    }
                    right={
                      !over && (
                        <div className="flex gap-1">
                          {p.alive ? (
                            <button
                              className="btn btn-danger !min-h-9 !px-2 !py-1 text-xs"
                              onClick={async () => (await confirm({ title: `Eliminate ${p.name}?`, body: 'Use this only to correct a genuine mistake. It is announced publicly as a Game Master correction.', confirm: 'Eliminate', danger: true })) && act({ type: 'eliminate', playerId: p.id })}
                            >
                              Eliminate
                            </button>
                          ) : (
                            <button
                              className="btn btn-ghost !min-h-9 !px-2 !py-1 text-xs"
                              onClick={async () => (await confirm({ title: `Restore ${p.name}?`, body: 'They return to the game. This is announced publicly as a Game Master correction.', confirm: 'Restore' })) && act({ type: 'restore', playerId: p.id })}
                            >
                              Restore
                            </button>
                          )}
                          <button
                            className="btn btn-ghost !min-h-9 !px-2 !py-1 text-xs"
                            title="Issue a rejoin code"
                            onClick={async () => {
                              if (!(await confirm({ title: `Move ${p.name} to a new device?`, body: 'A one-time code lets them reclaim their seat on another phone. Their current device will be logged out once the code is used.', confirm: 'Get code' }))) return;
                              const a = await act({ type: 'issue_rejoin', playerId: p.id });
                              if (a.ok) setRejoin({ name: p.name, code: String(a.data?.rejoinCode) });
                            }}
                          >
                            Rejoin
                          </button>
                        </div>
                      )
                    }
                  />
                );
              })}
            </ul>
          </Section>

          {h.secrets && (g.phase === 'night' || g.phase === 'prenight') && h.nightActions && (
            <Section title={g.phase === 'prenight' ? 'Dawn actions (secret)' : 'Night actions (secret)'}>
              {h.nightActions.length === 0 ? (
                <p className="text-sm text-mute">No actions yet.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {h.nightActions
                    .filter((a) => a.abilityId !== 'decoy')
                    .map((a) => (
                      <li key={a.actorId + a.abilityId}>
                        <b>{nameOf(a.actorId)}</b> <span className="text-mute">({roleName(a.actorId)})</span> · {ABILITIES[a.abilityId]?.name} →{' '}
                        {a.abilityId === 'steal' && a.targetId && ABILITIES[a.targetId] ? `${ABILITIES[a.targetId].name} (power)` : nameOf(a.targetId)}
                      </li>
                    ))}
                </ul>
              )}
            </Section>
          )}
          {h.secrets && g.phase === 'voting' && h.votes && (
            <Section title="Votes so far (secret)">
              <ul className="space-y-1 text-sm">
                {h.votes.map((v) => (
                  <li key={v.voterId}>
                    {nameOf(v.voterId)} → {v.targetId ? nameOf(v.targetId) : 'abstain'} {v.weight > 1 && <span className="text-gold">(×{v.weight})</span>}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {view.settings.homeLights && (
            <Section title="Living room Echo">
              <EchoVolumes view={view} send={send} />
            </Section>
          )}

          {!over && (
            <Section title="Public announcement">
              <form
                className="flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (msg.trim() && (await act({ type: 'announce', text: msg.trim() }, 'Announced.')).ok) setMsg('');
                }}
              >
                <input className="field" value={msg} maxLength={240} onChange={(e) => setMsg(e.target.value)} placeholder="e.g. Five-minute break!" aria-label="Announcement text" />
                <button className="btn btn-gold" disabled={!msg.trim() || busy}>
                  Send
                </button>
              </form>
            </Section>
          )}
        </div>

        <div className="space-y-4">
          {h.secrets && h.alignmentAlive && (
            <Section title="Balance of power (secret)">
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="chip text-good">🛡️ Town alive {h.alignmentAlive.good}</span>
                <span className="chip text-ember">🗡 Mafia alive {h.alignmentAlive.mafia}</span>
                {h.alignmentAlive.evil > 0 && <span className="chip text-[#e07ac8]">😈 Evil alive {h.alignmentAlive.evil}</span>}
                <span className="chip text-neutral">◆ Neutral alive {h.alignmentAlive.neutral}</span>
              </div>
              <p className="mt-2 text-xs text-mute">{h.winPreview ? `Win condition met: ${h.winPreview.faction}` : 'No faction has met its win condition yet.'}</p>
            </Section>
          )}
          <Section title={h.secrets ? 'Event log (full, private)' : 'Event log'}>
            <div className="max-h-[28rem] overflow-y-auto pr-1 scrollbar-thin">
              <Feed entries={h.log} limit={200} />
            </div>
          </Section>
          {!over && (
            <Section title="Game controls">
              <div className="flex flex-col gap-2">
                <a className="btn btn-ghost text-sm" href={`/tv/${view.code}`} target="_blank" rel="noreferrer">
                  Open TV display ↗
                </a>
                <button
                  className="btn btn-danger text-sm"
                  onClick={async () => (await confirm({ title: 'End the game now?', body: 'The game ends with no winner and every role is revealed.', confirm: 'End game', danger: true })) && act({ type: 'end_game' })}
                >
                  End game
                </button>
                <button
                  className="btn btn-danger text-sm"
                  onClick={async () => (await confirm({ title: 'Restart?', body: 'Back to the lobby with the same players. The current game is abandoned.', confirm: 'Restart', danger: true })) && act({ type: 'restart' })}
                >
                  Restart (back to lobby)
                </button>
                <button
                  className="btn btn-danger text-sm"
                  onClick={async () => (await confirm({ title: 'Cancel and close the room?', body: 'Everyone is disconnected. This cannot be undone.', confirm: 'Close room', danger: true })) && act({ type: 'close_room' })}
                >
                  Cancel game & close room
                </button>
              </div>
            </Section>
          )}
        </div>
      </div>

      <Modal open={!!rejoin} onClose={() => setRejoin(null)} title={`Rejoin code for ${rejoin?.name}`}>
        <p className="text-sm text-mute">On the new device: open the join page, enter room {view.code}, tap “Rejoin”, and type:</p>
        <p className="my-4 text-center font-[family-name:var(--font-display)] text-4xl tracking-[0.3em] text-gold">{rejoin?.code}</p>
        <p className="text-xs text-mute">Show this only to {rejoin?.name}. It works once.</p>
        <button className="btn btn-ghost mt-4 w-full" onClick={() => setRejoin(null)}>
          Done
        </button>
      </Modal>
    </div>
  );
}

/** The home Echo's two volumes (music, dramatic sounds) — they apply at once, even mid-game. */
function EchoVolumes({ view, send }: { view: GameProps['view']; send: GameProps['send'] }) {
  const { act } = useAct(send);
  const s = view.settings;
  const [music, setMusic] = useState(s.musicVolume ?? 35);
  const [sfx, setSfx] = useState(s.sfxVolume ?? 70);
  useEffect(() => setMusic(s.musicVolume ?? 35), [s.musicVolume]);
  useEffect(() => setSfx(s.sfxVolume ?? 70), [s.sfxVolume]);
  const row = (label: string, value: number, set: (n: number) => void, key: 'musicVolume' | 'sfxVolume', icon: string) => (
    <label className="flex items-center gap-3 px-1 py-1.5">
      <span className="w-36 shrink-0 text-sm">
        {icon} {label}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        aria-label={label}
        className="h-2 flex-1 cursor-pointer accent-[#c9a45c]"
        onChange={(e) => set(Number(e.target.value))}
        onPointerUp={(e) => act({ type: 'set_volume', [key]: Number((e.target as HTMLInputElement).value) })}
        onKeyUp={(e) => act({ type: 'set_volume', [key]: Number((e.target as HTMLInputElement).value) })}
      />
      <span className="w-10 text-right text-sm tabular-nums text-mute">{value}</span>
    </label>
  );
  return (
    <div className="mt-2 rounded-xl border border-line bg-black/20 p-2" data-testid="echo-volumes">
      {row('Music', music, setMusic, 'musicVolume', '🎵')}
      {row('Dramatic sounds', sfx, setSfx, 'sfxVolume', '💥')}
    </div>
  );
}
