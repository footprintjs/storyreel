/**
 * The chart's own refusals: fixed words only, so a refusal on the record never repeats a conversation's or a model's words.
 * What caused one (a parser's message, a model's own error, a library's refusal quoting a message) is kept beside it under
 * a private symbol: not an own enumerable field, not `cause`, so neither footprintjs nor a structured clone carries it into
 * the record. The facade hands it to the caller as `cause` once the run's record is taken.
 */
const ORIGINAL = Symbol('story refusal original');

export class StoryRefusal extends Error {
  constructor(message, original) {
    super(message);
    this.name = 'StoryRefusal';
    if (original !== undefined) Object.defineProperty(this, ORIGINAL, {value: original, enumerable: false});
  }
}

/** A stage that failed in a way the chart has no words for: its stage is named, its own error kept aside. */
export class StageFailed extends StoryRefusal {
  constructor(stage, original) {
    super(`the ${stage} stage failed: read this refusal's cause for why`, original);
    this.name = 'StageFailed';
  }
}

/** What caused a refusal, or undefined. */
export const originalOf = (error) => (error instanceof StoryRefusal ? error[ORIGINAL] : undefined);
