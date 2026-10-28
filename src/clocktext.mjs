/**
 * Times on the film clock as people and agents write them: m:ss (h:mm:ss past an hour), or plain seconds. One owner
 * for both ways — read from a command's flags (clockSeconds: storyreel part --from 0:12 --to 0:18) and said in a line
 * to read (clockOf: storyreel changes) — so a time a line says can be handed back as a flag.
 */
import {clockText} from 'footprint-story';

/**
 * Seconds on the film clock as m:ss (h:mm:ss past an hour): rounded down ('floor', the default), up ('ceil'), to the
 * nearest second ('nearest'), or as given to the hundredth ('exact': 0:12.5).
 */
export function clockOf(t, round = 'floor') {
  if (round === 'exact') {
    const whole = Math.floor(t + 1e-6), part = +(t - whole).toFixed(2);
    return part > 0 && part < 1 ? `${clockText(Math.max(0, whole))}${part.toFixed(2).slice(1).replace(/0+$/, '')}` : clockText(Math.max(0, Math.round(t)));
  }
  const whole = round === 'ceil' ? Math.ceil(t - 1e-6) : round === 'nearest' ? Math.round(t) : Math.floor(t + 1e-6);
  return clockText(Math.max(0, whole));
}

/**
 * A time on the film clock as a command takes it: seconds (12, 12.5) or m:ss (0:12, 1:02.5; h:mm:ss past an hour). Read
 * from short text only, each field a few digits (minutes and seconds after the first under 60): anything else refuses,
 * naming `name` (the flag).
 */
export function clockSeconds(value, name = 'time') {
  const text = String(value ?? '').trim(), fields = text.length <= 20 ? text.split(':') : [];
  const fine = fields.length >= 1 && fields.length <= 3 && fields.every((f, i) => (i === fields.length - 1 ? /^\d{1,6}(?:\.\d{1,3})?$/ : /^\d{1,4}$/).test(f)) && fields.slice(1).every(f => Number(f) < 60);
  if (!fine) throw new Error(`${name} is a time on the film clock: seconds (12.5) or m:ss (0:12), not ${JSON.stringify(text.slice(0, 24))}`);
  return fields.reduce((t, f) => t * 60 + Number(f), 0);
}
