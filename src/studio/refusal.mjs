/** A request the studio refuses: its reason, which the page shows, and its HTTP status (422: the pick or the recipe refuses). */
export class Refusal extends Error {
  constructor(message, status = 422) { super(message); this.status = status; }
}
