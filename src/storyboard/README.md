# storyboard/ — a film from a story written as data

**Why:** telling a story from a conversation should not mean writing a recipe by hand. An agent fills in a shape from
`footprint-story/storyboard`, every mistake comes back at once, and this folder makes the film's own inputs from it.

| file | holds |
|---|---|
| `film.mjs` | a read storyboard as a film's storyboard and recipe: plain data in, plain data out |
| `create.mjs` | the command-line and MCP door: `shapes`, `brief` and `create`, keeping every file inside the project |
| `fixes.mjs` | a refused board as what `create` says back: one short brief per piece at fault, words kept apart as data |

```bash
npx storyreel shapes                                     # the shapes, and how to fill each
npx storyreel brief --shape what-we-found --conversation chat.json   # what a model needs to write one
npx storyreel create --from story.json --to my-film --conversation chat.json
```

`create` names every problem of a refused board, grouped by piece, each piece with what it says now and the messages it cites. With
`--from`, change those pieces in the file and run `create` again, without rewriting the board. With `--story`, give the whole board
again: `create` takes no piece on its own. Problems a film adds come once the board itself reads.

A film draws `what-we-found` for now: `told-twice` is refused, naming what it can draw. The film is silent until it is given
a voice, as any film is.

Words stay words: a film's script reads braces as its own marks and has no way to write one as text, so a storyboard with a
brace is refused. So is a card with no moment of its own, whose words are all said elsewhere in its scene.
