# Changelog

## Unreleased

### Added

- Mouse support: `moveMouse`, `moveMouseBy`, `click`, `mouseDown`, `mouseUp`,
  `scroll` and `mousePosition`, with matching sequence actions and CLI commands
  (`move`, `moveby`, `click`, `mousedown`, `mouseup`, `scroll`). Keyboard and mouse
  actions mix in one batch.
- Moves can glide over a duration: a point every 4 ms, timed natively in one call.
- Coordinates are physical pixels on Windows whatever the display scaling, and
  points on macOS. On Linux only relative moves are available for now.
- `Kimacro` has every action method, including `keyDown` and `keyUp`.
- `down` and `up` sequence actions, matching `keyDown` and `keyUp`.
- `npm run bench`: realistic scenarios (typing, a form, a game macro, a mouse
  workflow) run through Kimetra, robotjs and nut.js against a local browser page
  that checks what arrived and when. `--report` writes the results as Markdown.
  See `bench/README.md`.

### Fixed

- Key names inherited from `Object.prototype`, such as `constructor`, were accepted
  as keys and sent key code 0. They now throw like any unknown key.

### Changed

- Linux creates its virtual keyboard and pointer only when first used, so a
  keyboard-only script no longer pays for the pointer device, and the reverse.

- Hotkeys no longer wait one gap after the last key-up, which saves 1 ms per
  hotkey. Key order and the hold before release are unchanged.
- Every method compiles through the same path as `executeSequence`. Array errors
  now name the action type, for example `hotkey needs an array of keys`.
- Batches use `[op, a, b]` records to make room for mouse actions. A binary built
  for the old layout is refused with a clear error instead of being misread.
- The native code is one shared N-API layer (`src/cpp/addon.cpp`) over a small
  backend per platform. The compiled file is now `kimetra.node`.
- `index.cjs` is gone. `require('kimetra')` resolves to `src/kimetra.js` directly.

## 2.1.0

### Added

- A `kimetra` command. Commands chain by being written one after another, and a
  whole chain compiles into a single native call. Covers `key`, `keys`,
  `hotkey`, `repeat`, `type`, `wait`, `run` and `list`.
- CLI numbers are milliseconds by default, with `--unit us` for parity with the
  library. Macro files always hold microseconds, so `--dry-run` output and
  `Kimacro().toJSON()` output are interchangeable.
- `type -` and `run -` read stdin.

### Fixed

- Windows: `typeText` sent two Enter presses for a CRLF pair. Carriage returns
  are now dropped, matching macOS and Linux.
- `keyDown` and `keyUp` left a stray sleep in the batch when the key name was
  invalid, which replayed on the next call.
- A key map that failed to load for any reason other than being absent was
  reported as an unsupported platform.

### Changed

Arguments that were previously coerced or ignored now throw:

- Durations, delays and intervals must be finite, non-negative and within
  2147483647 microseconds. Larger values used to wrap and skip the wait.
- `repeatKey` requires a whole count. Zero remains a no-op.
- `typeText` requires a string.
- `pressKeys`, `pressHotkey` and `executeSequence` require an array.
- Raw key codes must be whole numbers from 0 to 65535.
- `wait` actions and `sleep()` require a duration.
- `Kimacro.add()` stores a copy instead of modifying the caller's object.
- `Kimetra(null)` uses the defaults instead of throwing.

## 2.0.0

A correctness and simplification release. The API surface is smaller, keys are
plain strings, and whole action batches now execute inside the native addon.

### Breaking

- The package exports exactly three things: `Kimetra`, `Kimacro` and `Key`.
- `Kimetra` is now the factory. Use `const ki = Kimetra(options)`. The class is
  no longer exported, and `createKimetra` and `createKimacro` are gone.
- Keys are passed as strings: `ki.pressKey('enter')` instead of `Key.enter`.
  `Key` is still exported for use with the low level `core` API.
- `quickActions` has been removed. Create an instance instead.
- Removed convenience methods that were plain aliases: `arrowUp`, `arrowDown`,
  `arrowLeft`, `arrowRight`, `tab`, `space`, `backspace`, `delete`, `altF4`,
  `winKey`, `taskManager`, and the whole `cmd*` family. Use `repeatKey`,
  `pressKey` or `pressHotkey`.
- `holdKey` has been removed. `pressKey(key, duration)` does the same thing.
- `Kimacro.execute()` never existed. The method is `exec()`.
- The `type` action in a sequence is now called `text`.
- `initialize`, `version` and `name` are no longer exported.
- Minimum Node version is now 16.

### Fixed

- The ESM entry point used `require` and threw on every `import`. It has never
  worked until now.
- Every `quickActions` call threw `ReferenceError: api is not defined`.
- `wait` in sequences and macros read the wrong field and ignored its duration
  entirely, sleeping 700 microseconds instead.
- A macro cleared itself after `exec()`, so it could only ever run once.
- `pressKeys` checked `delay` instead of `interval`, so the interval was never
  applied.
- `winKey()` passed a key name where a code was expected and silently did nothing.
- Invalid keys threw `ReferenceError: key is not defined` rather than a useful
  message.
- `createKimetra` ignored every documented option name.
- `cleanup()` was a no-op because no addon exported `Cleanup`.
- `quickActions.selectAllPaste` pasted nothing and copied instead.

### Cross platform

- `ctrl`, `shift`, `alt` and `meta` now exist on all three platforms and resolve
  to the left-hand key. Previously they existed only on Windows, so `copy`,
  `paste` and every other shortcut silently did nothing on macOS and Linux.
- Editing shortcuts resolve per platform: Cmd on macOS, Ctrl elsewhere, with
  `redo` and `replace` using the chord each platform actually expects.
- macOS: Accessibility permission is now checked, with instructions, instead of
  silently discarding every event.
- macOS: modifier flags are tracked and applied, so combinations work reliably.
- macOS: text is sent in chunks with matching key-up events, and no longer uses
  the key code for `a`.
- macOS: corrected or removed key codes that pointed at the wrong keys, including
  the media and browser keys that macOS does not have.
- Linux: `/dev/uinput` permission failures now throw with the udev rule to apply.
- Linux: `typeText` reports characters it cannot produce instead of silently
  dropping them.
- Linux: the virtual device declares the full key range, so no mapped key is
  filtered out by the kernel.
- Windows: extended-key and scan-code information is now filled in, which fixes
  arrow keys, right-hand modifiers and the numpad in applications that read raw
  input.
- Windows: rejected input (an elevated foreground window) now throws instead of
  failing silently.

### Performance

- Whole action batches are compiled into a flat buffer and executed in one native
  call. A three-key hotkey went from about thirteen crossings of the JS to native
  boundary to one.
- Sleeps compute an absolute deadline before waiting, and busy-wait only the last
  1.2 milliseconds instead of a fixed 100 milliseconds. Windows uses a high
  resolution waitable timer, Linux uses `clock_nanosleep`, macOS uses
  `mach_wait_until`.

### Other

- Hand written TypeScript definitions with a full key-name union.
- The binary is resolved at runtime, so a skipped `postinstall` no longer breaks
  the package. The script is now a size optimisation only.
- A real test suite that sends no key events, run in CI on every platform.
- Added the LICENSE file, which was referenced but never shipped.
