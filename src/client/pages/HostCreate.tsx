import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { MAX_PLAYERS, MIN_PLAYERS } from '../../shared/settings';
import { PlayerCountInput } from '../components/PlayerCountInput';
import { Shell, Toggle } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { saveSession } from '../lib/session';

export default function HostCreate() {
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [hostCode, setHostCode] = useState('');
  // The code box only appears when the server has HOST_CODE set.
  const [codeRequired, setCodeRequired] = useState(false);
  useEffect(() => {
    api<{ hostCodeRequired: boolean }>('/api/config').then((c) => setCodeRequired(c.hostCodeRequired), () => undefined);
  }, []);
  const [count, setCount] = useState(8);
  const [hostPlays, setHostPlays] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Enter your display name.');
    if (count < MIN_PLAYERS || count > MAX_PLAYERS) return setError(`Player count must be ${MIN_PLAYERS}–${MAX_PLAYERS}.`);
    setBusy(true);
    try {
      const r = await api<{ code: string; token: string }>('/api/rooms', { hostName: name.trim(), playerCount: count, hostPlays, hostCode: hostCode.trim() });
      saveSession({ code: r.code, token: r.token, kind: 'host', name: name.trim() });
      nav(`/r/${r.code}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the room.');
      setBusy(false);
    }
  };

  return (
    <Shell>
      <form onSubmit={submit} className="mx-auto max-w-md space-y-6 anim-fade-up" noValidate>
        <div className="text-center">
          <p className="eyebrow">Host a game</p>
          <h1 className="brand-title mt-2 text-4xl font-bold">Open the room</h1>
          <p className="mt-2 text-sm text-mute">You’ll fine-tune characters and house rules in the lobby while people join.</p>
        </div>
        <div className="card space-y-5 p-5">
          {codeRequired && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Host code</span>
              <input
                className="field tracking-[0.3em]"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={hostCode}
                maxLength={32}
                onChange={(e) => setHostCode(e.target.value)}
                placeholder="••••••"
              />
              <span className="mt-1 block text-xs text-mute">Only Unsorted Plans hosts have this. Guests don’t need it — they just join.</span>
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Your display name</span>
            <input className="field" value={name} maxLength={20} autoComplete="nickname" onChange={(e) => setName(e.target.value)} placeholder="e.g. Sadie" autoFocus />
          </label>
          <PlayerCountInput value={count} onChange={setCount} />
          <Toggle
            label="I’m also playing"
            hint="You get a secret role too, and your host screen will NOT show anyone’s role — the app runs the game for you."
            checked={hostPlays}
            onChange={setHostPlays}
          />
          {!hostPlays && <p className="rounded-lg border border-line/60 bg-black/30 p-3 text-xs text-mute">As Game Master you can see every role and action, so you should not also play.</p>}
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-ember/50 bg-blood/40 p-3 text-sm">
            {error}
          </p>
        )}
        <button className="btn btn-primary w-full text-lg" disabled={busy}>
          {busy ? 'Opening…' : 'Create room'}
        </button>
      </form>
    </Shell>
  );
}
