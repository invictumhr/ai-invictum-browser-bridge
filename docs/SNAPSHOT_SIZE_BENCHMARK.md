# Snapshot size benchmark

> Dated measurement record. Snapshot formats and limits can evolve; use runtime
> capabilities and the current snapshot schemas for the operating contract.

Measured on 2026-07-22 against the built and reloaded unpacked extension. Byte counts are compact UTF-8 JSON for the response `data` object, not pretty-printed terminal output. Input values are never included.

The original reported fixture response was approximately 65 KB of pretty-printed JSON for 35 elements. The current compact 35-element response is 14,699 bytes: roughly 77% smaller, exceeding the requested 40% fixture target.

The table below also uses a stricter synthetic comparison: it expands every omitted optional/default element field inside the same compact envelope. This isolates schema compaction from whitespace removal, so its percentages are intentionally lower than the real before/after measurement.

| Page           | Representation        | Elements |  Bytes | Reduction vs expanded |
| -------------- | --------------------- | -------: | -----: | --------------------: |
| `basic-form`   | expanded equivalent   |       35 | 20,864 |              baseline |
| `basic-form`   | compact `interactive` |       35 | 14,699 |                 29.5% |
| `basic-form`   | compact `outline`     |       21 |  4,653 |                 77.7% |
| `kitchen-sink` | expanded equivalent   |       68 | 39,739 |              baseline |
| `kitchen-sink` | compact `interactive` |       68 | 28,440 |                 28.4% |
| `kitchen-sink` | compact `outline`     |       32 |  6,852 |                 82.8% |
| `example.com`  | expanded equivalent   |        4 |  3,179 |              baseline |
| `example.com`  | compact `interactive` |        4 |  2,405 |                 24.3% |
| `example.com`  | compact `outline`     |        1 |    848 |                 73.3% |

All three outline measurements exceed the requested 70% target even under the stricter synthetic comparison. On `example.com`, the pre-compaction loaded extension returned 3,634 bytes; the current interactive response is 2,405 bytes (33.8% smaller) and outline is 848 bytes (76.7% smaller).

Reproduce while the fixture, authority and extension are connected:

```powershell
node scripts/benchmark-snapshots.mjs `
  http://127.0.0.1:47822/basic-form `
  http://127.0.0.1:47822/kitchen-sink `
  https://example.com/
```

The script opens each page through the Bridge, measures interactive and outline data in one session, and unlocks every tab in `finally`.
