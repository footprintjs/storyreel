/**
 * Listening: what the sound asks of the viewer. A sound on every change of picture stops meaning anything —
 * the ear learns to ignore it — so about half the changes should be silent; the same cue twice running sounds
 * like a loop; and effects as loud as the voice bury the words. The film lists what it finds
 * (film.listening, from the changes of picture and their sounds); a render measures the voice and the effects
 * apart and says when the effects are too close to the voice. A recipe that says "listening": "refuse" refuses
 * the film's own findings.
 */

/** share: at most this share of the changes of picture sound (about half silent), judged from `least` changes; under: LU the effects stay under the voice. */
export const LISTENING = Object.freeze({share: .6, least: 4, under: 10});

/** Check a recipe's `listening` setting: 'report' (the default: the film lists what it finds) or 'refuse'. */
export function listeningMode(value) {
  if (value === undefined) return 'report';
  if (value !== 'report' && value !== 'refuse') throw new Error('listening must be "report" or "refuse"');
  return value;
}

/**
 * What the sounds of the changes of picture ask of the ear. changes: [{at, where, sound}] in film order
 * (sound: the entrance's sound, or null). Returns [{kind: 'every-change' | 'same-twice', at, where?, text}].
 */
export function changeSounds(changes, rule = LISTENING) {
  const out = [], sounding = changes.filter(c => c.sound);
  if (changes.length >= rule.least && sounding.length / changes.length > rule.share)
    out.push({kind: 'every-change', at: +sounding[0].at.toFixed(3), text: `${sounding.length} of ${changes.length} changes of picture make a sound; about half should be silent (an entrance's "sound": false) — a sound marks a change only when it matters`});
  // Neighbouring changes only: a sound, a silent change, then the same sound again is the rhythm recommended above.
  for (let i = 1; i < changes.length; i++) {
    const [a, b] = [changes[i - 1], changes[i]];
    if (a.sound && a.sound === b.sound) out.push({kind: 'same-twice', at: +b.at.toFixed(3), where: b.where, text: `${a.where} and ${b.where} both enter with a ${b.sound}, one after the other: give the second another sound, or none`});
  }
  return out;
}

/**
 * The effects against the voice, measured apart (integrated loudness, LUFS): a finding when the effects are
 * less than `under` LU under the voice. Either may be null (nothing measured: no voice, no effects).
 */
export function effectsUnderVoice({voice, effects}, rule = LISTENING) {
  if (!Number.isFinite(voice) || !Number.isFinite(effects) || voice <= -69 || effects <= -69) return null;
  const gap = voice - effects;
  return gap >= rule.under ? null : {kind: 'effects-loud', at: 0, text: `the effects are ${gap.toFixed(1)} LU under the voice (${effects.toFixed(1)} against ${voice.toFixed(1)} LUFS); keep them at least ${rule.under} LU under, so the words stay clear`};
}

/** One finding in words, for a refusal or a list. */
export const listeningText = f => f.text;
