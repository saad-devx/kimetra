# Benchmarks

Every library sends real keystrokes, clicks and scrolls to a browser page that records
when each event arrives. All of them are therefore measured the same way, at the receiving
end, and every run is checked for correctness. Each scenario is built from a fixed seed, so
every library runs exactly the same steps. The numbers are medians of 3 runs.

Measured on 2026-10-14:

| | |
| --- | --- |
| OS | Windows 11 (build 26200), x64 |
| CPU | Intel Core i5-13450HX |
| Node | v22.22.3 |
| Browser | Chrome 152 |
| Kimetra | this repository at the time of the run |
| Also measured | robotjs 0.9.1, @nut-tree-fork/nut-js 4.2.6 |

Kimetra appears twice. "One sequence" runs each scenario as a single `executeSequence`
call, which is how Kimetra is meant to be used. "One call per step" makes one call per
action with `setTimeout` waits in between, which is how the other libraries are used.

## Summary

| Library | Correct runs | Added on top s | Timing error ms |
| --- | --- | --- | --- |
| kimetra, one sequence | 15/15 | 0.35 | 0.91 |
| kimetra, one call per step | 15/15 | 1.49 | 10.6 |
| robotjs | 15/15 | 1.66 | 11.0 |
| nut.js | 15/15 | 4.87 | 25.5 |

"Added on top" is time beyond what the realistic scenarios ask for, summed over them.
"Timing error" is the median of how far each gap between two events, as received by the
page, was from the planned gap. Both leave out the synthetic key-tap test.

The two Kimetra rows show where the difference comes from: one call per step with
`setTimeout` waits performs like robotjs, because both are then limited by the event loop
and the OS timer. One native batch is not.

## Scenarios

### Key taps

| Library | Correct runs | Fewest received | Total ms | Taps per second |
| --- | --- | --- | --- | --- |
| kimetra, one sequence | 3/3 | 500/500 | 118.0 | 4,237 |
| kimetra, one call per step | 3/3 | 500/500 | 115.1 | 4,345 |
| robotjs | 3/3 | 500/500 | 116.0 | 4,309 |
| nut.js | 3/3 | 500/500 | 15112.0 | 33 |

500 taps of F20, sent as fast as each library can. The only synthetic test. Kimetra and
robotjs are equal here because the time per event is spent inside the OS, not the library.

### Typing

| Library | Correct runs | Total s | Planned s | Added ms | Timing error ms |
| --- | --- | --- | --- | --- | --- |
| kimetra, one sequence | 3/3 | 1.65 | 1.58 | 66.9 | 1.12 |
| kimetra, one call per step | 3/3 | 2.14 | 1.58 | 559.0 | 10.2 |
| robotjs | 3/3 | 2.15 | 1.58 | 561.4 | 10.3 |
| nut.js | 3/3 | 3.04 | 1.58 | 1451.7 | 26.0 |

One sentence typed a character at a time, 15 to 115 ms apart, longer after spaces and
commas.

### Filling a form

| Library | Correct runs | Total s | Planned s | Added ms | Timing error ms |
| --- | --- | --- | --- | --- | --- |
| kimetra, one sequence | 3/3 | 5.04 | 4.92 | 118.4 | - |
| kimetra, one call per step | 3/3 | 5.23 | 4.92 | 305.3 | - |
| robotjs | 3/3 | 5.22 | 4.92 | 299.4 | - |
| nut.js | 3/3 | 6.86 | 4.92 | 1943.9 | - |

Five fields reached by pointer glides and clicks, with pauses, a select-all retype, a
corrected typo and a two-line note, then a click on Submit.

### Game macro

| Library | Correct runs | Total s | Planned s | Added ms | Timing error ms |
| --- | --- | --- | --- | --- | --- |
| kimetra, one sequence | 3/3 | 3.40 | 3.38 | 23.7 | 0.66 |
| kimetra, one call per step | 3/3 | 3.70 | 3.38 | 320.0 | 9.41 |
| robotjs | 3/3 | 3.73 | 3.38 | 349.1 | 10.6 |
| nut.js | 3/3 | 4.23 | 3.38 | 851.9 | 24.2 |

Three rounds of movement keys with overlapping holds, a jump while running and a sprint,
every press and release on a planned schedule.

### Mouse workflow

| Library | Correct runs | Total s | Planned s | Added ms | Timing error ms |
| --- | --- | --- | --- | --- | --- |
| kimetra, one sequence | 3/3 | 5.88 | 5.74 | 136.6 | 18.2 |
| kimetra, one call per step | 3/3 | 6.05 | 5.74 | 308.9 | 35.4 |
| robotjs | 3/3 | 6.19 | 5.74 | 450.6 | 26.8 |
| nut.js | 3/3 | 6.36 | 5.74 | 620.5 | 64.6 |

Glides to five targets at varied distances with a pause before each click, one of them a
double click and one a right click, then a drag and drop and scrolling a list. Timing
error here is measured between button presses, which sit at the end of glides, so it
includes how precisely each library ends a glide.

## Without input

### Load time

`require()` time, median of 15 fresh processes.

| Library | ms |
| --- | --- |
| kimetra | 3.34 |
| robotjs | 5.16 |
| @nut-tree-fork/nut-js | 146.3 |

### Call cost

From the method call until native code has the batch, with nothing sent.

| Call | Time per call |
| --- | --- |
| pressKey | 326 ns |
| pressHotkey, 2 keys | 421 ns |
| typeText, 50 characters | 307 ns |
| click | 307 ns |
| moveMouseBy, 100 ms glide (25 points) | 571 ns |
| executeSequence, the game macro (71 actions) | 2.11 µs |

### Wait accuracy

Time past the requested wait, in ms. The other libraries wait between actions with
`setTimeout`.

| Wait | Method | Median | p99 | Worst |
| --- | --- | --- | --- | --- |
| 1 ms | kimetra native wait | 0.00 | 0.03 | 0.04 |
| 1 ms | setTimeout | 14.5 | 15.4 | 15.4 |
| 5 ms | kimetra native wait | 0.01 | 0.20 | 0.40 |
| 5 ms | setTimeout | 10.6 | 11.4 | 11.6 |
| 16 ms | kimetra native wait | 0.02 | 0.19 | 0.19 |
| 16 ms | setTimeout | 14.9 | 15.9 | 15.9 |

## Run it yourself

Run from the repository root, with binaries built from the current source in `src/bin`.

```bash
npm run bench                  # sends no input
npm run bench -- --input       # also runs the scenarios with real input, in a browser page
npm run bench -- --report      # everything, written as Markdown to bench/report.md
npm run bench -- --runs 5      # runs each scenario 5 times (default 3)
npm run bench -- --only nut    # only libraries whose name contains "nut"
```

To compare against other libraries, install them without saving them:

```bash
npm install --no-save robotjs @nut-tree-fork/nut-js
```

`bench/report.md` is ignored by git. To update this page, paste its tables over the ones
above and update the date and environment.

## How it works

With `--input`, the benchmark starts a small local web server and opens a page in your
browser. That page is the target of every keystroke, click and scroll. It records each
event with its own timestamp, then reports what it received.

Clicking Start switches the page to full screen. A page cannot maximise its own window,
so this is the closest it can get, and it leaves full screen when the run ends. It then
counts down 3 seconds and starts the countdown again whenever the pointer moves, so the
run never begins with a hand still on the mouse.

The page only receives input while it has focus. Before each run the benchmark checks for
focus and full screen, and waits for a click on the page if either was lost.

Each library's pointer units are measured against the page before the scenarios: the
library moves the pointer to two points, then a third point must land within 3 units of
the result. Before each pointer run, the pointer is placed on the page centre and must
arrive within 2 px. A failed check repeats the measurement; a run whose pointer still
misses is reported as not run.

| Scenario | What it does | Checked |
| --- | --- | --- |
| Key taps | 500 taps of F20, as fast as possible. The only synthetic test. | All 500 arrive |
| Typing | A sentence typed a character at a time, 15 to 115 ms apart | Text matches; timing |
| Filling a form | Glides and clicks into five fields, a select-all retype, a corrected typo, a two-line note, then Submit | All fields and the submit |
| Game macro | Movement keys with overlapping holds, a jump while running and a sprint, on a planned schedule | Every press and release, in order; timing |
| Mouse workflow | Glides to five targets with a pause before each click, a double click, a right click, a drag and drop and scrolling | Each target, the drop and the scroll; timing of the presses |

## What the numbers mean

- **Correct runs**: runs where the page received exactly what was sent.
- **Planned**: the time the scenario asks for: its waits and the length of its glides.
- **Added**: time beyond the planned time. This is the library's own overhead, plus how far
  its waits overshoot. For Kimetra it includes the 0.7 ms key and click holds it adds on
  purpose, so apps register every press.
- **Timing error**: the median, over every two consecutive events, of how far the gap the
  page received was from the planned gap. This is what matters when timing matters, such
  as in game macros.

## Fairness

- Every library's own delays are set to zero: robotjs `setKeyboardDelay(0)` and
  `setMouseDelay(0)`, nut.js `autoDelayMs = 0`. Their defaults would otherwise dominate
  (10 ms per event for robotjs, 300 ms per key for nut.js).
- Each library runs the steps through the calls its users would write, in `drivers.js`.
  Waits use `setTimeout`, except in Kimetra's sequence mode, where they are part of the
  batch. Kimetra also runs as one call per step, like the others.
- Glides: Kimetra glides natively and nut.js uses `mouse.move` at the speed that takes the
  planned time. robotjs has no timed glide, so its driver moves the pointer every 4 ms to
  where the glide should be at that moment, which keeps the total time right even when
  `setTimeout` fires late.
- Pointer coordinates are measured for each library separately, because libraries work in
  different units on scaled displays. On Windows at 125%, Kimetra uses physical pixels,
  while robotjs and nut.js use scaled ones and see a 1920×1080 screen as 1536×864.
- Medians are reported, so one slow run does not move the result.

## Notes

- On Linux, Kimetra has no absolute pointer moves yet, so the mouse workflow is skipped and
  the form is filled with Tab instead of clicks.
- Timestamps are precise to a few microseconds in Chrome and Edge, because the page is
  served cross-origin isolated. Other browsers may round them, which the report notes.
