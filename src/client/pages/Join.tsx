import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PhotoPicker } from '../components/PhotoPicker';
import { Shell } from '../components/ui';
import { uploadPhoto } from '../lib/photo';
import { ApiError, api, type RoomInfo } from '../lib/api';
import { loadSession, saveSession, sessionHash } from '../lib/session';
import { isCodeWord, normalizeCode } from '../../shared/codewords';

export default function Join() {
  const params = useParams();
  const nav = useNavigate();
  const [code, setCode] = useState((params.code ?? '').toUpperCase());
  const [name, setName] = useState('');
  const [info, setInfo] = useState<RoomInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejoin, setRejoin] = useState(false);
  const [rejoinCode, setRejoinCode] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);

  const clean = normalizeCode(code);
  // A whole word (CUP) is complete at once; older letter codes (ABCDE) at 5 characters.
  const complete = isCodeWord(clean) || clean.length >= 5;

  // Already joined this room on this device? Go straight back in.
  useEffect(() => {
    if (complete && loadSession(clean)) nav(`/r/${clean}`, { replace: true });
  }, [clean, complete, nav]);

  useEffect(() => {
    setInfo(null);
    if (!complete) return;
    const t = setTimeout(() => {
      api<RoomInfo>(`/api/rooms/${clean}`)
        .then((r) => {
          setInfo(r);
          setError(null);
        })
        .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not check that room.'));
    }, 250);
    return () => clearTimeout(t);
  }, [clean, complete]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (clean.length < 3) return setError('Enter the room code word, like CUP.');
    setBusy(true);
    try {
      if (rejoin) {
        const r = await api<{ token: string; playerId: string }>(`/api/rooms/${clean}/rejoin`, { rejoinCode: rejoinCode.trim() });
        const s = { code: clean, token: r.token, kind: 'player' as const, name: '' };
        if (!saveSession(s)) return nav(`/r/${clean}${sessionHash(s)}`);
      } else {
        if (!name.trim()) {
          setBusy(false);
          return setError('Enter a display name.');
        }
        const r = await api<{ token: string; playerId: string }>(`/api/rooms/${clean}/join`, { name: name.trim() });
        const s = { code: clean, token: r.token, kind: 'player' as const, name: name.trim() };
        const kept = saveSession(s);
        // Photo is optional: if the upload fails, the player can retry from the lobby.
        if (photo) await uploadPhoto(clean, r.token, photo).catch(() => undefined);
        if (!kept) return nav(`/r/${clean}${sessionHash(s)}`);
      }
      nav(`/r/${clean}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not join.');
      setBusy(false);
    }
  };

  return (
    <Shell>
      <form onSubmit={submit} className="mx-auto max-w-md space-y-6 anim-fade-up" noValidate>
        <div className="text-center">
          <p className="eyebrow">Join a game</p>
          <h1 className="brand-title mt-2 text-4xl font-bold">Take a seat</h1>
        </div>
        <div className="card space-y-5 p-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Room code</span>
            <input
              className="field text-center font-[family-name:var(--font-display)] text-2xl tracking-[0.4em] uppercase"
              value={code}
              maxLength={8}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. CUP"
              aria-describedby="room-status"
            />
          </label>
          <div id="room-status" aria-live="polite" className="min-h-5 text-sm">
            {info && (
              <p className={info.joinable ? 'text-ok' : 'text-ember'}>
                {info.joinable ? `✓ ${info.hostName}’s room — ${info.players}/${info.capacity} players` : info.reason}
              </p>
            )}
          </div>
          {!rejoin ? (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Your display name</span>
              <input className="field" value={name} maxLength={20} autoComplete="nickname" onChange={(e) => setName(e.target.value)} placeholder="What should the table call you?" />
            </label>
          ) : null}
          {!rejoin ? (
            <PhotoPicker name={name} value={photo} onChange={setPhoto} busy={busy} />
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Rejoin code from the host</span>
              <input className="field text-center tracking-[0.3em] uppercase" value={rejoinCode} maxLength={8} autoCapitalize="characters" autoComplete="off" spellCheck={false} onChange={(e) => setRejoinCode(e.target.value.toUpperCase())} placeholder="e.g. LAMP" />
              <span className="mt-1 block text-xs text-mute">Use this only if you lost your phone/browser session. The host can issue a code from their dashboard.</span>
            </label>
          )}
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-ember/50 bg-blood/40 p-3 text-sm">
            {error}
          </p>
        )}
        <button className="btn btn-primary w-full text-lg" disabled={busy || (!rejoin && info !== null && !info.joinable)}>
          {busy ? 'Joining…' : rejoin ? 'Reclaim my seat' : 'Join room'}
        </button>
        <div className="flex flex-col items-center gap-2 text-sm text-mute">
          <button type="button" className="underline underline-offset-4" onClick={() => setRejoin((r) => !r)}>
            {rejoin ? 'Join as a new player instead' : 'Already in this game on another device? Rejoin'}
          </button>
          <Link to="/guide" className="underline underline-offset-4">
            How to play
          </Link>
        </div>
      </form>
    </Shell>
  );
}
