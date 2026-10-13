# Benchmarks

Run from the repository root, with binaries built from the current source in `src/bin`.

```bash
npm run bench                 # sends no input
npm run bench -- --input      # also sends real keyboard and mouse input
npm run bench -- --markdown   # prints Markdown tables, ready for the README
npm run bench -- --runs 5     # repeats each input measurement 5 times (default 3)
```

To compare against other libraries, install them without saving them:

```bash
npm install --no-save robotjs @nut-tree-fork/nut-js
```

## What is measured

| Measurement | Input sent | What it shows |
| --- | --- | --- |
| Load time | No | `require()` time, measured inside 15 fresh processes |
| Call cost | No | Time from a Kimetra method call until native code has the batch. The batch is empty, so nothing reaches the OS. |
| Wait accuracy | No | How far a requested wait overshoots: Kimetra's native wait against `setTimeout`, which other libraries wait with |
| Key taps | Yes | 500 presses and releases of F20, a key apps ignore |
| Pointer moves | Yes | 500 one-pixel moves back and forth |
| Typing | Yes | 300 characters typed into a text editor |
| Editing script | Yes | `script.js`: 114 steps of typing, navigation, selection, shortcuts, pointer glides, clicks, scrolling and waits |

The editing script reports its total time, the waits the script itself asks for, and
everything added on top. For Kimetra, part of what is added is deliberate: it holds each
key for 0.7 ms and leaves 1 ms between the keys of a shortcut, so apps register every key.
The "holds off" row sets the holds to zero, as the other libraries have them, so the rows
can be compared like for like. The 1 ms shortcut gap stays, because it is fixed.

## Fairness

- Every library's own delays are set to zero: robotjs `setKeyboardDelay(0)` and
  `setMouseDelay(0)`, nut.js `autoDelayMs = 0`. Their defaults would otherwise dominate
  (10 ms per event for robotjs, 300 ms per key for nut.js).
- Every library runs the same steps, written once in `script.js`, through the calls its
  users would write, in `drivers.js`. Waits use `setTimeout`, except in Kimetra's sequence
  mode, where they are part of the batch.
- Kimetra runs twice: as one sequence, and as one call per step like the others.
- Medians are reported, so one slow run does not move the result.

## Before running with `--input`

1. Open an empty text editor (Notepad, TextEdit, gedit) and maximise it.
2. Click inside it and leave the pointer over the middle of the window.
3. Do not touch the keyboard or mouse until it finishes. Ctrl+C aborts.

On Linux, Kimetra cannot read the pointer position, so its pointer measurements use
relative moves, and robotjs and nut.js need X11.
