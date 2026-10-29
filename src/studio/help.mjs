/**
 * The usage of `storyreel studio` and `storyreel apply`, as `storyreel --help` lists them (test/skills.test.mjs reads
 * their command and flag lines). Text only, so the CLI lists them without loading the studio: its server and the canvas
 * load when its command runs (studio/cli.mjs, apply-cli.mjs).
 */
export const STUDIO_HELP = `  studio   — the preview studio on this project: the picture at the playhead, the timeline, what drew each spot, and a
           gallery of every transition and word move playing, to Try on the scene at the playhead and Keep as one line
           (storyreel apply); it compiles again when the recipe or storyboard changes. Local only (127.0.0.1), it only
           reads (GET) and writes nothing; any other flag reaches the config's film(flags), as the tools' do (--ep ep1)
             --port  the port, 0–65535 (4321; 0: any free one)
             --recipe  the recipe's JSON file, for the line a click names and to watch (default: recipe.json beside the config)`;
export const STUDIO_USAGE = `storyreel studio [--port n] [--config file] [--recipe file] [--flag value …]\n${STUDIO_HELP}`;

export const APPLY_HELP = `  apply    "<scene> enter <transition>" | "<scene> move <move>" … — the lines kept in the studio's gallery, written into
           the project's recipe: a stage's entrance, or a kinetic world's word move. Every line is checked first (the
           scene, its stage or kinetic world, the name) and the edited recipe compiled; one that refuses writes nothing.
           Only the values set change in the file; one line printed per change. Any other flag reaches the config's
           film(flags), as the tools' do (--ep ep1)
             --recipe  the recipe's JSON file to write (default: recipe.json beside the config); it must hold the recipe that film reads
             --record  print one JSON object instead: {file, written, changes, refusals, record}, the record each line's checks and why`;
export const APPLY_USAGE = `storyreel apply "<scene> enter <transition>" ["<scene> move <move>" …] [--recipe file] [--record] [--config file] [--flag value …]\n${APPLY_HELP}`;
