import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { saveCSession } from '../lib';
import { BollyShell } from '../ui';

export default function CharadesHostCreate() {
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [hostCode, setHostCode] = useState('');
  const [codeRequired, setCodeRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ hostCodeRequired: boolean }>('/api/config').then((c) => setCodeRequired(c.hostCodeRequired), () => undefined);
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Enter your name.');
    setBusy(true);
    try {
      const r = await api<{ code: string; token: string }>('/api/charades/rooms', { hostName: name.trim(), hostCode: hostCode.trim() });
      saveCSession({ code: r.code, token: r.token, kind: 'host', name: name.trim() });
      nav(`/c/${r.code}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the room.');
      setBusy(false);
    }
  };

  return (
    <BollyShell>
      <form onSubmit={submit} className="anim-fade-up mx-auto max-w-md space-y-6" noValidate>
        <div className="text-center">
          <p className="eyebrow">Host a game</p>
          <h1 className="charades-title mt-2 text-5xl">Lights on!</h1>
          <p className="mt-2 text-sm text-white/70">You’re the judge. Set rounds and the timer in the lobby while the captains join.</p>
        </div>
        <div className="card space-y-5 p-5">
          {codeRequired && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Host code</span>
              <input className="field tracking-[0.3em]" type="password" inputMode="numeric" autoComplete="off" value={hostCode} maxLength={32} onChange={(e) => setHostCode(e.target.value)} placeholder="••••••" />
              <span className="mt-1 block text-xs text-white/60">Only Unsorted Plans hosts have this. Captains don’t need it.</span>
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Your name</span>
            <input className="field" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sadiq" autoComplete="nickname" />
          </label>
          {error && (
            <p className="rounded-xl border border-[#ff3d6b]/50 bg-[#ff3d6b]/10 p-3 text-sm" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-bolly w-full text-lg" disabled={busy}>
            {busy ? 'Opening…' : 'Open the room'}
          </button>
        </div>
      </form>
    </BollyShell>
  );
}
