# FastCSV

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/KuntoSadewo/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/KuntoSadewo/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0, written for the
[csv-reader-speed-01-run-20261121](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
bounty: it reads broken CSV files and answers exactly as csv-reader does —
same `{columns, rows, errors}`, same broken-row policy — only faster.

## How it works

`solve.js` exports `run(input)`, which parses `{text, header}` in a single
left-to-right pass. Instead of walking one character at a time, every field
jumps straight to its next delimiter with one native regex scan, quoted
stretches are sliced whole (line-break normalisation applies only to
stretches that hold one), and rows are padded or cut to the first record's
width exactly as the reference does.

`main.ts` is the program the harness runs: it reads every case from
`/input/cases.json`, answers each one alone with `run`, and writes
`/output/answers.json`.

## Local check

Practice set (6 cases, ~11 MB of CSV): all 6 answers identical to the
reference, and the parser runs about 2.3× faster than csv-reader 1.0.0
on this machine (~200 ms vs ~480 ms solve-only).

## License

MIT — see [LICENSE](LICENSE).
