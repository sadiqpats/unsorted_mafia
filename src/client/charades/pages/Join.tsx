import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { loadCSession, saveCSession } from '../lib';
import { BollyShell } from '../ui';

interface Info {
  code: string;
  hostName: string;
  status: string;
  teams: { name: string; captain: string | null }[];
}

export default function CharadesJoin() {
  const nav = useNavigate();
  const params = useParams();
  const [search] = useSearchParams();
  const [code, setCode] = useState((params.code ?? '').toUpperCase());
  const [team, setTeam] = useState<0 | 1 | null>(search.get('team') === '2' ? 1 : search.get('team') === '1' ? 0 : null);
  const [name, setName] = useState('');
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setInfo(null);
    if (code.length < 5) return;
    // Already a captain (or the host) in this room on this phone? Go straight back in.
    if (loadCSession(code)) {
      nav(`/c/${code}`, { replace: true });
      return;
    }
    const ctl = { live: true };
    api<Info>(`/api/charades/rooms/${code}`).then(
      (i) => ctl.live && (setInfo(i), setError(null)),
      (e) => ctl.live && setError(e instanceof ApiError ? e.message : 'Could not find that room.'),
    );
    return () => {
      ctl.live = false;
    };
  }, [code]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (team === null) return setError('Pick your team.');
    if (!name.trim()) return setError('Enter your name.');
    setBusy(true);
    try {
      const r = await api<{ code: string; token: string; name: string }>(`/api/charades/rooms/${code}/join`, { team, name: name.trim() });
      saveCSession({ code: r.code, token: r.token, kind: 'captain', name: r.name });
      nav(`/c/${r.code}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not join.');
      setBusy(false);
      api<Info>(`/api/charades/rooms/${code}`).then(setInfo, () => undefined);
    }
  };

  return (
    <BollyShell>
      <form onSubmit={submit} className="anim-fade-up mx-auto max-w-md space-y-6" noValidate>
        <div className="text-center">
          <p className="eyebrow">Join as captain</p>
          <h1 className="charades-title mt-2 text-5xl">Captain, step up!</h1>
          <p className="mt-2 text-sm text-white/70">One captain per team. Your phone shows the movie — guard it with your life.</p>
        </div>
        <div className="card space-y-5 p-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Room code</span>
            <input
              className="field text-center text-xl uppercase tracking-[0.5em]"
              value={code}
              maxLength={5}
              autoCapitalize="characters"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="ABCDE"
            />
          </label>
          {info && (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Your team ({info.hostName}’s room)</legend>
              <div className="grid grid-cols-2 gap-3">
                {info.teams.map((t, i) => {
                  const taken = !!t.captain;
                  const on = team === i;
                  return (
                    <button
                      type="button"
                      key={i}
                      disabled={taken}
                      aria-pressed={on}
                      onClick={() => setTeam(i as 0 | 1)}
                      className={`score-tile team-${i} ${on ? 'is-acting' : ''} min-h-24 text-left disabled:opacity-50`}
                    >
                      <span className="block truncate font-semibold text-white">{t.name}</span>
                      <span className="mt-1 block text-xs text-white/75">{taken ? `Captain: ${t.captain}` : 'Seat free'}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Your name</span>
            <input className="field" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="What should we call you?" autoComplete="nickname" />
          </label>
          {error && (
            <p className="rounded-xl border border-[#ff3d6b]/50 bg-[#ff3d6b]/10 p-3 text-sm" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-bolly w-full text-lg" disabled={busy || !info}>
            {busy ? 'Joining…' : 'Join as captain'}
          </button>
        </div>
      </form>
    </BollyShell>
  );
}
