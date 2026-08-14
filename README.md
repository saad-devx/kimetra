# Kimetra

[![npm version](https://badge.fury.io/js/kimetra.svg)](https://badge.fury.io/js/kimetra)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/kimetra.svg)](https://nodejs.org)
[![Platform Support](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue.svg)](#platform-setup)

![Banner](https://raw.githubusercontent.com/saad-devx/kimetra/refs/heads/main/src/assets/banner.jpg)

Kimetra is a cross-platform keyboard automation library for Node.js. It is a
performance first library focused on speed and precision with no external
dependencies at all. It suits gaming macros just as well as any automation tool
or script.

## Features

- **Native performance**: direct OS API calls through precompiled binaries.
- **Cross-platform**: Windows, macOS and Linux, with the same key names everywhere.
- **Batched execution**: a whole action sequence runs inside one native call, so
  JavaScript adds no latency between key events.
- **Microsecond timing**: waits target an absolute deadline instead of drifting.
- **Small**: three exports, no dependencies, one small binary per platform.
- **Low level access**: the raw addon is always reachable through `ki.core`.

## How it works

Kimetra ships a small C++ addon per platform and architecture, built on
`SendInput` on Windows, `CGEvent` on macOS and `uinput` on Linux. Nothing is
compiled at install time. It deletes the binaries and key maps
which your machine cannot use post install, leaving one binary of well under 150 KB behind.

The npm download itself contains all six binaries, so the download is larger than
the installed footprint.

## Install

```bash
npm install kimetra
```

## Platform setup

Windows needs nothing.
macOS and Linux each need a one-time permission grant else, Kimetra throws with instructions
if the grant is missing.

### Windows

No config but one caveat: Windows blocks input from a normal process to a
window running as administrator. If the target app is elevated, run your script
elevated too.

### macOS

Open **System Settings > Privacy & Security > Accessibility** and enable the
application running your script: Terminal, iTerm, VS Code, or your packaged app.
If it is already listed, remove it, add it again, then restart the process.

macOS invalidates the grant whenever the binary's signature changes. Terminal's
"Secure Keyboard Entry" and focused password fields block synthetic input entirely.

### Linux

Kimetra writes to `/dev/uinput`, which works on both X11 and Wayland but needs
permission:

```bash
echo 'KERNEL=="uinput", GROUP="input", MODE="0660"' | sudo tee /etc/udev/rules.d/99-kimetra.rules
sudo usermod -aG input $USER
```

Reboot afterwards, or run the process as root.

## Quick start

```javascript
import { Kimetra } from 'kimetra';
// or in CommonJS
const { Kimetra } = require('kimetra');

const options = {
  unit: 'microsecond', // 'microsecond' (default) or 'millisecond'
  delay: 0,            // delay before an action starts
  interval: 700,       // gap between repeated actions
  duration: 700,       // how long a single key is held
  hotkeyDelay: 1500    // how long a combination is held before release
}

const ki = Kimetra(options); // whole options object is optional (more on it below)

await ki.pressKey('enter');
await ki.pressHotkey(['ctrl', 'c']);
await ki.pressKeys(['a', 'b', 'c']);
await ki.typeText('Kimetra focuses on speed, precision and staying small');

ki.cleanup();
```

## Key names

Keys are plain strings. Names are lower case, with no spaces or punctuation.

```javascript
await ki.pressKey('a');
await ki.pressKey('f11');
await ki.pressHotkey(['ctrl', 'shift', 'escape']);
```

| Group | Names |
| --- | --- |
| Letters and digits | `a` to `z`, `0` to `9` |
| Function keys | `f1` to `f20` |
| Modifiers | `ctrl`, `shift`, `alt`, `meta` & `lctrl`, `rshift`, `lalt`, `lmeta` |
| Control | `enter`, `escape`, `space`, `tab`, `backspace`, `delete`, `capslock` |
| Navigation | `up`, `down`, `left`, `right`, `home`, `end`, `pageup`, `pagedown` |
| Numpad | `numpad0` to `numpad9`, `numpadadd`, `numpadsubtract`, `numpadmultiply`, `numpaddivide`, `numpaddecimal` |
| Symbols | `semicolon`, `equal`, `comma`, `hyphen`, `dot`, `fslash`, `bslash`, `grave`, `quote`, `squarebracketstart`, `squarebracketend` |
| Volume | `volumemute`, `volumedown`, `volumeup` |

`ctrl`, `shift`, `alt` and `meta` resolve to the left-hand key. Use `lctrl` or
`rctrl` when the side matters. `meta` is the Windows key, the Command key on
macOS and the Super key on Linux, and also answers to `cmd`, `win` and `super`.

Everything above works on all three platforms. Keys that only some platforms
have, such as `insert`, `printscreen`, `numlock`, the media transport keys and
the browser keys, throw a clear error where the OS has no such key. Your editor
will flag them through the TypeScript definitions.
## API

The package exports exactly three things.

```javascript
const { Kimetra, Kimacro, Key } = require('kimetra');
```

### Kimetra(options)

```javascript
const ki = Kimetra({
  unit: 'microsecond', // 'microsecond' (default) or 'millisecond'
  delay: 0,            // delay before an action starts
  interval: 700,       // gap between repeated actions
  duration: 700,       // how long a single key is held
  hotkeyDelay: 1500    // how long a combination is held before release
});
```

`unit` decides how Kimetra reads the numbers **you** pass, both in the options
above and in every method argument. In millisecond mode `ki.pressKey('a', 5)`
holds the key for 5 milliseconds. In microsecond mode the same call holds it for
5 microseconds.

It does not change the built-in defaults. Those are fixed real durations, so a
key you never gave a duration for is held for 700 microseconds either way.
Switching units never silently retimes anything you did not write yourself.

| Call | microsecond mode | millisecond mode |
| --- | --- | --- |
| `pressKey('a')` | 700 µs hold | 700 µs hold |
| `pressKey('a', 5)` | 5 µs hold | 5 ms hold |
| `sleep(500)` | 500 µs | 500 ms |

Pick a unit once and stay with it. The same snippet means different things under
different units.

**Methods**

| Method | Description |
| --- | --- |
| `pressKey(key, duration?, delay?)` | Press and release a key, holding it for `duration`. |
| `pressKeys(keys[], interval?, delay?)` | Press several keys one after another. |
| `pressHotkey(keys[], duration?, delay?)` | Press keys together, releasing in reverse order. |
| `repeatKey(key, times, interval?, delay?)` | Press the same key `times` times. |
| `typeText(text, delay?)` | Type text. |
| `keyDown(key, delay?)` | Press a key down and leave it held. |
| `keyUp(key, delay?)` | Release a held key. |
| `sleep(duration)` | Block for `duration`. |
| `executeSequence(actions[])` | Run a list of actions as one batch. |
| `cleanup()` | Release native resources. Safe to call more than once. |

All of these return a promise. To hold a key for two seconds, pass a duration:

```javascript
await ki.pressKey('shift', 2000000); // two seconds in microseconds
```

### Editing shortcuts

These resolve to the chord each platform actually uses, so the same call works
everywhere. Cmd on macOS, Ctrl elsewhere.

```javascript
await ki.copy();
await ki.paste();
await ki.cut();
await ki.selectAll();
await ki.undo();
await ki.redo();    // Ctrl+Y on Windows, Cmd+Shift+Z on macOS, Ctrl+Shift+Z on Linux
await ki.save();
await ki.find();
await ki.replace(); // Ctrl+H, or Cmd+Option+F on macOS
```

Anything else is a hotkey. There is no separate `cmd` family and no aliases for
single keys:

```javascript
await ki.pressHotkey(['alt', 'f4']);
await ki.pressKey('meta');
await ki.repeatKey('tab', 3);
await ki.repeatKey('up', 5, 100);
```

### Sequences

A sequence compiles into one native call, which makes it the fastest way to run
several actions.

```javascript
await ki.executeSequence([
  { type: 'hotkey', keys: ['alt', 'tab'] },
  { type: 'wait', duration: 500000 },
  { type: 'text', text: 'Sequence text' },
  { type: 'key', key: 'enter' },
  { type: 'repeat', key: 'down', times: 3, interval: 1000 },
  { type: 'keys', keys: ['a', 'b'], interval: 2000 }
]);
```

| Action | Fields |
| --- | --- |
| `key` | `key`, `duration?`, `delay?` |
| `keys` | `keys[]`, `interval?`, `delay?` |
| `hotkey` | `keys[]`, `duration?`, `delay?` |
| `repeat` | `key`, `times`, `interval?`, `delay?` |
| `text` | `text`, `delay?` |
| `wait` | `duration` |

### Kimacro(options)

A chainable builder over the same sequences, with JSON serialisation. A macro can
be replayed as often as you like.

```javascript
const { Kimacro } = require('kimetra');

const macro = Kimacro()
  .pressKey('enter')
  .typeText('hello')
  .pressHotkey(['ctrl', 's'])
  .wait(1000000);

await macro.exec();
await macro.exec(); // runs again, the sequence is kept
```

Saving and loading:

```javascript
const fs = require('fs');

fs.writeFileSync('login.json', JSON.stringify(macro.toJSON()));

const loaded = Kimacro().fromJSON(JSON.parse(fs.readFileSync('login.json')));
await loaded.exec();
```

`Kimacro` takes the same options as `Kimetra`, and also has `add(action)`,
`clear()` and `cleanup()`.

### Low level access

`ki.core` is the raw addon. Everything there works in key codes and microseconds
regardless of the instance options, which is what `Key` is for.

```javascript
const { Kimetra, Key } = require('kimetra');

const ki = Kimetra();
const core = ki.core;

core.KeyDown(Key.enter);
core.Sleep(500);
core.KeyUp(Key.enter);

core.SendString('Kimetra is Key plus Simulation plus Spectra');

console.log(ki.os, ki.arch);
ki.cleanup();
```

`core` exposes `KeyDown`, `KeyUp`, `SendString`, `Sleep`, `Run` and `Cleanup`.
`Sleep` is more accurate than `setTimeout` and avoids the scheduling overhead of
returning to the event loop.

## Notes

**Execution is synchronous.** The methods return promises so that `await` reads
naturally and so real concurrency can be added later, but the work happens in a
blocking native call. A one second wait blocks the event loop for one second. Use
short waits inside sequences, and keep long pauses in JavaScript.

**Linux text is US ASCII.** `uinput` sends scan codes, so `typeText` on Linux can
only produce what a US QWERTY layout produces. Anything else throws and names the
character. Windows and macOS inject unicode directly and handle any text. Use the
clipboard for unicode on Linux.

**Layouts matter.** Key names describe physical keys. On a non-US layout, `quote`
is whatever your layout puts on that key.

**Newline and tab** are sent as real Enter and Tab key presses on every platform,
so `typeText('a\nb')` behaves the same everywhere.

## Supported targets

`win32-x64`, `win32-ia32`, `darwin-x64`, `darwin-arm64`, `linux-x64`,
`linux-ia32`. Node 16 or newer.

Anything else, including `linux-arm64` and Alpine, fails at require time with a
message naming your platform.

## License

MIT © Saad
