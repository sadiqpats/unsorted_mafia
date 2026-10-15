import { serverUrl } from './server';

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(serverUrl(path), {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('offline', 'Can’t reach the server. Check your connection and try again.', 0);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json?.error?.code ?? 'error', json?.error?.message ?? 'Something went wrong.', res.status);
  return json as T;
}

export interface RoomInfo {
  code: string;
  status: string;
  hostName: string;
  players: number;
  capacity: number;
  joinable: boolean;
  reason: string | null;
}
