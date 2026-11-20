/**
 * Stage 27 of the compile: the film's moments and rows — the moments worth a still (each scene settled, each change
 * of picture, push and camera move half way through: sheet.mjs) and the film as rows of pictures (each row's
 * entrance, the entries that draw it: segments.mjs plans renders from them). Its own stage because both are
 * read after the compile, by the stills sheet and the render's planner, from what the earlier stages decided.
 *
 * Reads: clock, storyboard, push, stages, shots, teaser, pushes, camerawork, pictureChanges, storyPath, stagePath.
 * Writes: moments(), rows().
 */

export function momentsStage(state) {
  const {clock, storyboard, push, stages, shots, teaser, pushes, camerawork, pictureChanges, storyPath, stagePath} = state;
  /**
   * The moments worth a still (sheet.mjs): each scene's picture once it has settled, and each change of
   * picture half way through — [{t, kind: 'settled' | 'moving', label}], in time order.
   */
  function moments() {
    const out = [], changes = pictureChanges().filter(c => c.to > c.from);
    for (const c of changes) out.push({t: (c.from + c.to) / 2, kind: 'moving', label: `mid ${c.what}`});
    for (const p of pushes) out.push({t: p.a + p.seconds / 2, kind: 'moving', label: `mid push: ${p.note}`});
    for (const m of camerawork?.record.moves ?? []) if (m.played === 'move' && m.family !== 'texture') out.push({t: (m.at + Math.min(m.until, clock.total)) / 2, kind: 'moving', label: `mid ${m.move}: ${m.path}`});
    storyboard.scenes.forEach(sc => {
      // The quietest point of the scene: half way between the end of anything arriving and the next change.
      const from = Math.max(clock.start(sc.id), ...changes.filter(c => c.to <= clock.end(sc.id)).map(c => c.to)), to = Math.min(clock.end(sc.id), ...changes.filter(c => c.from > from).map(c => c.from));
      out.push({t: to > from ? (from + to) / 2 : (clock.start(sc.id) + clock.end(sc.id)) / 2, kind: 'settled', label: sc.title ?? sc.id});
    });
    return out.filter(m => m.t >= 0 && m.t < clock.total).sort((a, b) => a.t - b.t);
  }

  /**
   * The film as rows of pictures (segments.mjs plans renders from them): when each row's picture starts
   * to arrive (`from`: its entrance begins, `lead` seconds before its first scene), the recipe entries that
   * draw it (`paths`), and how it arrives (`enter`: null for the first; a cut, or a transition that draws
   * the row before it too). A film with a pushIn is one row: its stages hand over on one page.
   */
  function rows() {
    if (push) return [{from: 0, start: 0, paths: [storyPath, 'pushIn', 'card', ...stages.map(stagePath)], stage: storyPath, enter: null, pushIn: true}];
    // A teaser rewinds through the film (drawTeaser draws earlier moments), so its row draws every row's entries,
    // and says which moments it replays (`rewinds`: from–to, played at–until) for what they bring with them.
    const everything = [storyPath, ...stages.map(stagePath)];
    return shots.map((shot, j) => {
      const teasing = !shot.world && shot.stages.some(st => st.teaserAt);
      return {
        from: j === 0 ? 0 : shot.start - shot.enter.lead, start: shot.start,
        paths: j === 0 ? [storyPath] : shot.world ? [stagePath(stages.find(st => st.world === shot.world))] : teasing ? everything : shot.stages.map(stagePath),
        // The entry the row begins with (its first stage, or the story): what a check names when it means this row.
        stage: j === 0 ? storyPath : stagePath(shot.stages[0] ?? stages.find(st => st.world === shot.world)),
        enter: j === 0 ? null : {type: shot.enter.type, ...(shot.enter.move ? {move: shot.enter.move} : {}), seconds: shot.enter.seconds, lead: shot.enter.lead},
        ...(teasing ? {rewinds: Object.freeze({from: Math.min(teaser.from, teaser.to), to: Math.max(teaser.from, teaser.to), at: teaser.at + 2.7, until: teaser.at + 4.8})} : {}),
      };
    });
  }
  Object.assign(state, {moments, rows});
}
