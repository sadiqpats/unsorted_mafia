import { useEffect, useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS } from '../../shared/settings';

const OPTIONS = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i);

/** Dropdown + editable number field, kept in sync and validated (any integer 5–22). */
export function PlayerCountInput({ value, onChange, disabled, min = MIN_PLAYERS }: { value: number; onChange: (n: number) => void; disabled?: boolean; min?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const n = Number(text);
  const valid = Number.isInteger(n) && n >= Math.max(MIN_PLAYERS, min) && n <= MAX_PLAYERS;
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium" id="pc-label">
        Number of players (including you if you play)
      </span>
      <div className="flex gap-2" role="group" aria-labelledby="pc-label">
        <select className="field flex-1" aria-label="Choose player count" value={OPTIONS.includes(value) ? value : ''} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))}>
          {OPTIONS.map((o) => (
            <option key={o} value={o} disabled={o < min}>
              {o} players
            </option>
          ))}
        </select>
        <input
          className={`field !w-24 text-center ${valid ? '' : '!border-ember'}`}
          type="number"
          inputMode="numeric"
          min={MIN_PLAYERS}
          max={MAX_PLAYERS}
          step={1}
          aria-label="Type player count"
          aria-invalid={!valid}
          value={text}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            const v = Number(e.target.value);
            if (Number.isInteger(v) && v >= Math.max(MIN_PLAYERS, min) && v <= MAX_PLAYERS) onChange(v);
          }}
          onBlur={() => !valid && setText(String(value))}
        />
      </div>
      {!valid && (
        <p className="mt-1 text-xs text-ember" role="alert">
          Enter a whole number from {Math.max(MIN_PLAYERS, min)} to {MAX_PLAYERS}.
        </p>
      )}
    </div>
  );
}
