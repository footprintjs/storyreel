# storyboard/ — a film from a story written as data

**Why:** telling a story from a conversation should not mean writing a recipe by hand. An agent fills in a shape from
`footprint-story/storyboard`, every mistake comes back at once, and this folder makes the film's own inputs from it.

| file | holds |
|---|---|
| `film.mjs` | a read storyboard as a film's storyboard and recipe: plain data in, plain data out |
| `create.mjs` | the command-line and MCP door: `shapes`, `brief` and `create`, keeping every file inside the project |

```bash
npx storyreel shapes                                     # the shapes, and how to fill each
npx storyreel brief --shape what-we-found --conversation chat.json   # what a model needs to write one
npx storyreel create --from story.json --to my-film --conversation chat.json
```

A film draws `what-we-found` for now: `told-twice` is refused, naming what it can draw. The film is silent until it is given
a voice, as any film is.
