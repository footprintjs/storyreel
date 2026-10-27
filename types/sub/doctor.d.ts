/** What the doctor says of one thing a render needs: available (its list names it), missing (read, and not there), unknown (the list could not be read). */
export type DoctorStatus = 'available' | 'missing' | 'unknown';
/** One thing asked for: a program, an FFmpeg component or a font stack, what it is for, its status and why. */
export interface DoctorItem {kind: 'program' | 'encoder' | 'filter' | 'muxer' | 'demuxer' | 'font'; name: string; for: string; status: DoctorStatus; why?: string}
/** A program asked for its version. */
export interface DoctorProgram {path: string; status: DoctorStatus; version?: string | null; why?: string}
/** The doctor's report: ok when nothing a render cannot do without is missing (fonts aside), sure when nothing is unknown. */
export interface DoctorReport {ffmpeg: DoctorProgram; ffprobe: DoctorProgram | null; items: DoctorItem[]; missing: DoctorItem[]; unknown: DoctorItem[]; ok: boolean; sure: boolean}
/** The render's options as the doctor reads them, to ask only for what that render needs. */
export interface DoctorRender {check?: boolean; edit?: boolean; quality?: 'standard' | 'draft' | 'high'; stamp?: boolean; found?: boolean}
/** How a program is run: its text out and how it ended (spawnSync's shape). */
export type DoctorRun = (command: string, args: string[]) => {stdout?: string | null; stderr?: string | null; status: number | null; error?: (Error & {code?: string}) | undefined; signal?: string | null};

export const STATUSES: readonly DoctorStatus[];
/** What a render may need from FFmpeg, each with what it is for and when (a render's options). */
export const NEEDS: readonly {kind: DoctorItem['kind']; name: string; for: string; when?: (render: DoctorRender) => boolean}[];
/** The names one of FFmpeg's lists gives (-encoders, -filters, -muxers, -demuxers), or null when the text is not such a list. */
export function parseList(kind: 'encoder' | 'filter' | 'muxer' | 'demuxer', text: string): Set<string> | null;
/** A program's version from its -version text, or null. */
export function versionOf(text: string): string | null;
/** A CSS font stack's families, unquoted. */
export function stackFamilies(stack: string): string[];
/** A font stack as drawn here: available (with the family it is drawn in), missing, or unknown. */
export function fontStatus(stack: string, fonts: {has(family: string): boolean}): {status: DoctorStatus; why: string};
/** Ask this machine what a render needs (left out, `render` asks for everything). */
export function doctor(options?: {ffmpeg?: string; ffprobe?: string; render?: DoctorRender | null; themes?: (string | object)[]; fonts?: {has(family: string): boolean} | null; run?: DoctorRun}): DoctorReport;
/** The report as lines to read. */
export function doctorText(report: DoctorReport): string;
/** Refuse when a render cannot be made here (anything but a font missing); returns the report. */
export function requireDoctor(report: DoctorReport, who?: string): DoctorReport;
