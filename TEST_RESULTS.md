# TEST_RESULTS.md — site-generator-speed-01-run-20261122

All runs below were executed locally on this VM (Node v24.22.1; the grader runs
Node 22.23.4 / harness node v26.13.1, so absolute times are a local comparison
only — always against the house baseline measured beside it on the same machine).

## 1. Practice set — differential vs expected.json (kit)

Command: `node main.ts` on `practice/input/cases.json`, answers compared with
`practice/reference/expected.json` (deep JSON equality).

- g-0001: IDENTICAL (276 files)
- g-0002: IDENTICAL (350 files)
- g-0003: IDENTICAL (509 files)

## 2. Speed — end-to-end median (fresh process per run, 7 runs, twice)

Harness: `node /tmp/sitegen-bench.mjs <bot-dir> 7` (runs `node main.ts` on the
practice set with `MAKEFUN_INPUT_DIR`/`MAKEFUN_OUTPUT_DIR`).

| run | house baseline (makefun-site 1.0.0) | this entry |
|---|---|---|
| round 1 median | 997.7 ms | 575.2 ms |
| round 2 median | 992.1 ms | 587.9 ms |

Speedup end-to-end: ~1.7x. `run()` alone (cold, summed over the 3 cases,
in-process): ~335 ms vs baseline ~719 ms (~2.1x). Fixed overhead in both:
JSON.parse of cases ~26 ms, JSON.stringify of answers ~71 ms, Node startup.

## 3. Freshly drawn sets — differential vs the kit oracle

Command: `node /tmp/sitegen-drawtest.mjs` — draws new sets with the kit's own
`program/generator/draw.ts` from fresh seeds and compares with the oracle's
`expected.json`.

- Seeds 0–3: 12/12 cases IDENTICAL (225–571 files each)
- Seeds 0–1 (re-run after final edits): 6/6 cases IDENTICAL

## 4. Adversarial edge cases — differential vs baseline `build()`

Command: `node /tmp/sitegen-fuzz.mjs` — 86 hand-crafted inputs (front-matter
refusals, quoted-string escapes, leap dates, tag/slug edge cases, slug
collisions, Unicode titles, Markdown corners, template parse failures,
include depth, loop-var shadowing, shadowed statics, pagination, empty site,
reading-minutes boundaries incl. Unicode whitespace).

- Result: 86/86 identical.
- The fuzz found 2 real bugs during development, both fixed and re-verified:
  1. a stray `]` was treated as a link opener in the inline scanner;
  2. the quoted-string escape error message ended with 1 backslash instead of 2.

## 5. Kit grade-local (server's own dev grading, process driver)

Command (from the unpacked kit dir):

```
node cli/makefun.mjs grade-local --kit . --bot <repo> --driver process
```

- Kit verified: 41 files
- Scores: `{"cases_passed":3,"cases_total":3,"passed":1}`
- Checks: 3 of 3 points over 1 check (generated/generated)
- L1 regrade: reproduced byte for byte
- result_sha256: `8ac2d837ff757301b618be65659c60cecfc31b4c6d501a8d79b4e75a432c51bb`
- Note printed by the kit: this result_sha256 cannot equal the server's
  because the server harness runs node v26.13.1 and this machine runs v24.22.1.
- Transcripts: not supplied (this competition makes them optional:
  `transcripts_required: false`, "no transcript gate runs"). Grade-local
  reports `authored 0.000000000` and `cost unpriced` for that reason; the
  entry is still listed as eligible, ranked yes, prize yes.

## 6. SolAPI judge — NOT RUN (provider down)

- `list-models` OK: `gpt-6.1-sol` available.
- Build delegation (`POST /v1/responses`): HTTP 503 on the first call (helper
  retried twice internally) and again on a delayed retry ~90 s later.
- Judge 2-pass call: HTTP 503 again.
- Substituted with a structured self-critique (section-by-section audit of
  `solve.js` against the reference semantics) plus the differential evidence
  above. **No 95/100 judge score is claimed.**

## 7. Zero-fail QA (clean directory)

- Fresh temp dir with only the package files; `node main.ts` on the practice
  set exits 0 and produces answers identical to `expected.json` (see §1).
- No dependencies; no imports in `solve.js` at all.
- No absolute paths, no home-directory paths, no secrets in the package
  (grep-verified). No `.env` file. Total package size 44,461 bytes, well
  under the 4 MiB cap. `.makefun/owner.json` is exactly 58 bytes.

## 8. Kit pre-submit check

Command (from the unpacked kit dir):

```
node cli/makefun.mjs check --kit . --repo <package> --worktree
```

- 5 passed, 0 failed, 15 skipped, 5 checked at submission.
- Passed: competition_open, snapshot (6 files, 44,459 bytes), license_osi
  (MIT), entrypoint (main.ts, node22), entry_size (within 4 MiB cap).
- All transcript checks skip: "the gate does not bind this entry
  (site-generator-speed-01-run-20261122 does not require transcripts)".
- Checked at submission (need the GitHub repo, done by the parent):
  repo_public, repo_owner (`.makefun/owner.json` is in the package),
  repo_created_after_open, commit_in_repo, duplicate_snapshot.
