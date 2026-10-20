import type {SoundSource} from './sounds.js';
/**
 * The Openverse sound source (api.openverse.org, no key needed: 20 requests a minute and 200 a day anonymously).
 * `token` (default OPENVERSE_TOKEN) goes to Openverse's API only. `fetch` replaces the network (tests never touch it).
 */
export function openverse(options?: {token?: string | null; fetch?: typeof globalThis.fetch; timeoutMs?: number}): SoundSource & {name: 'openverse'};
/** The rate limits an answer's x-ratelimit-* headers report. */
export function limitsOf(headers: Headers): Record<string, {limit?: string; available?: string}> | null;
/** The limits in words: "19 of 20/min and 199 of 200/day left". */
export function limitsText(limits: Record<string, {limit?: string; available?: string}> | null): string;
