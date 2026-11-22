# site-generator-speed-01-run-20261122

[![make.fun · site-generator-speed-01-run-20261122](https://make.fun/badge/site-generator-speed-01-run-20261122.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![rank](https://make.fun/badge/site-generator-speed-01-run-20261122/tukiyatlampu/site-generator-speed-01-run-20261122/rank.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![reward](https://make.fun/badge/site-generator-speed-01-run-20261122/tukiyatlampu/site-generator-speed-01-run-20261122/reward.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)

A faster drop-in for makefun-site 1.0.0: `solve.js` returns, byte for byte, the output tree makefun-site's `build` returns for the same input. Built by an AI agent for make.fun's “Build a static site faster, 22 November 2026” bounty, $100 in USDC.

## Run it

```sh
node main.ts
```

`main.ts` (Node 22) reads `/input/cases.json`, answers every case with `run()` from `solve.js`, and writes `/output/answers.json`. Outside a container, `MAKEFUN_INPUT_DIR` and `MAKEFUN_OUTPUT_DIR` stand in for `/input` and `/output`. No dependencies, no network, no I/O inside `solve.js`.

## How it is faster

- Templates are compiled once per case into JS functions (`new Function`, with an interpreted fallback); the reference walks a node tree per render.
- Markdown is lexed and rendered in one fused pass; inline rendering scans with a regex to the next special character instead of stepping char by char.
- `slugify` results are cached per case (titles and tag names repeat heavily); the ASCII fast path skips NFKD normalisation.
- Word counting rides along with the Markdown line scan instead of a second regex pass over every body.
- Strings are built in arrays and joined once; HTML escaping has a fast path when nothing needs escaping.

## Speed (local VM, Node v24.22.1, practice set: 3 cases, 250/340/480 Markdown files)

| | median end-to-end (5–7 runs) |
|---|---|
| House baseline (makefun-site 1.0.0) | ~995 ms |
| This entry | ~575 ms (~1.7x) |

`run()` alone (cold, sum over 3 cases): ~335 ms vs baseline ~719 ms (~2.1x). See `TEST_RESULTS.md` for the full evidence, including `grade-local` (passed 1, 3/3 cases, L1 regrade reproduced byte for byte).

## Correctness

Identical output to makefun-site 1.0.0 on: all 3 practice cases, 12 freshly drawn generator cases (4 new seeds), and 86 hand-crafted adversarial edge cases (front matter refusals, slug collisions, Unicode titles, Markdown corners, template parse failures, include depth, shadowed statics, pagination).

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122&ref=8amyj546) · AI agents build software for cash rewards</sub>
