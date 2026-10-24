import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Ack, CommandInput } from '../../shared/protocol';
import type { ClientView } from '../../shared/view-types';
import { serverUrl } from '../lib/server';

type Send = (cmd: CommandInput) => Promise<Ack>;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/**
 * The Mafia's secret chat, for the Mafia members only (never the Godfather), open from the role
 * reveal. Closed it is one quiet bar: no unread count, no blinking, no sound or vibration —
 * nothing that could give a Mafia phone away across the room. Members show with name and photo.
 */
export function MafiaChat({ view, send }: { view: ClientView; send: Send }) {
  const chat = view.me?.mafiaChat ?? [];
  const g = view.game!;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  // "… is typing": the server says for how long; this phone hides it when that runs out.
  const typers = view.me?.mafiaTyping ?? [];
  const seenAt = useMemo(() => Date.now(), [typers]);
  const [, redraw] = useState(0);
  useEffect(() => {
    if (!typers.length) return;
    const t = setTimeout(() => redraw((n) => n + 1), Math.max(...typers.map((x) => x.msLeft)) + 50);
    return () => clearTimeout(t);
  }, [typers]);
  const typing = typers.filter((x) => seenAt + x.msLeft > Date.now()).map((x) => x.name);
  const lastTyping = useRef(0);
  const onType = (v: string) => {
    setDraft(v);
    if (v.trim() && Date.now() - lastTyping.current > 2500) {
      lastTyping.current = Date.now();
      send({ type: 'mafia_typing' }).catch(() => {});
    }
  };
  // A new phase closes the chat, so it never hides a night choice or the vote.
  useEffect(() => setOpen(false), [g.phaseSeq]);
  useEffect(() => {
    if (open) list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [open, chat.length]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    const a = await send({ type: 'mafia_chat', text });
    setBusy(false);
    if (a.ok) {
      lastTyping.current = 0;
      setDraft('');
      setError(null);
    } else setError(a.error?.message ?? 'Not sent.');
  };

  if (!open)
    return (
      <button type="button" className="mchat-bar" onClick={() => setOpen(true)} data-testid="mafia-chat-bar">
        <span aria-hidden="true">🔒</span> Family chat <span className="mchat-bar-hint">tap to open</span>
      </button>
    );

  const self = view.me!;
  // Drawn over the whole page (above the site header), like a sheet.
  return createPortal(
    <div className="mchat" role="dialog" aria-label="Family chat" data-testid="mafia-chat">
      <div className="mchat-head">
        <span>
          <span aria-hidden="true">🔒</span> Family chat
        </span>
        <button type="button" className="mchat-close" onClick={() => setOpen(false)} aria-label="Close the chat">
          ✕
        </button>
      </div>
      <div className="mchat-list" ref={list}>
        {chat.length === 0 && <p className="mchat-empty">Only the family can see this. Nobody else knows it exists.</p>}
        {chat.map((m) => (
          <div key={m.seq} className={`mchat-msg ${m.you ? 'mchat-you' : ''}`} data-testid="mafia-chat-msg">
            {!m.you && (
              <span className={`mchat-face ${m.godfather ? 'mchat-gf' : ''}`} aria-hidden="true">
                {m.godfather ? '🕴' : m.photo ? <img src={serverUrl(m.photo)} alt="" draggable={false} /> : initials(m.name)}
              </span>
            )}
            <div className="mchat-bubble">
              {!m.you && <span className="mchat-name">{m.godfather ? `${m.name} says` : m.name}</span>}
              <span className="mchat-text">{m.text}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="mchat-typing" aria-live="polite" data-testid="mafia-typing">
        {typing.length === 1 ? `${typing[0]} is typing…` : typing.length > 1 ? `${typing.slice(0, -1).join(', ')} and ${typing.at(-1)} are typing…` : ''}
      </p>
      {self.alive ? (
        <form
          className="mchat-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input className="mchat-input" value={draft} maxLength={300} onChange={(e) => onType(e.target.value)} placeholder="Whisper to the family…" aria-label="Message" enterKeyHint="send" autoComplete="off" />
          <button type="submit" className="btn btn-primary !min-h-11 shrink-0" disabled={busy || !draft.trim()}>
            Send
          </button>
        </form>
      ) : (
        <p className="mchat-empty">You are out — you can read, but not write.</p>
      )}
      {error && <p className="px-3 pb-2 text-sm text-ember">{error}</p>}
    </div>,
    document.body,
  );
}
