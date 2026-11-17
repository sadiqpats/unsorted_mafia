import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { CODE_WORDS } from '../shared/codewords';
import type { Rng } from '../shared/engine';

/** Cryptographically secure RNG used for role shuffling and ids. */
export const secureRng: Rng = {
  int: (max) => randomInt(max),
  id: () => randomUUID(),
};

// No 0/O/1/I/L — easy to read aloud and type on a phone.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomCode(length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

/** A random everyday word (CUP, LAMP) that is not already taken. Falls back to letters if every word is in use. */
export function wordCode(taken: (code: string) => boolean): string {
  for (let i = 0; i < 60; i++) {
    const w = CODE_WORDS[randomInt(CODE_WORDS.length)];
    if (!taken(w)) return w;
  }
  const free = CODE_WORDS.filter((w) => !taken(w));
  if (free.length) return free[randomInt(free.length)];
  let code = randomCode(5);
  while (taken(code)) code = randomCode(5);
  return code;
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/** Simple token bucket keyed by an arbitrary string (socket id, IP…). */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();
  constructor(
    private capacity: number,
    private refillPerSec: number,
  ) {}

  take(key: string, now = Date.now()): boolean {
    const b = this.buckets.get(key) ?? { tokens: this.capacity, at: now };
    b.tokens = Math.min(this.capacity, b.tokens + ((now - b.at) / 1000) * this.refillPerSec);
    b.at = now;
    if (b.tokens < 1) {
      this.buckets.set(key, b);
      return false;
    }
    b.tokens -= 1;
    this.buckets.set(key, b);
    if (this.buckets.size > 10_000) this.buckets.clear();
    return true;
  }
}
