# Kimetra

[![npm version](https://badge.fury.io/js/kimetra.svg)](https://badge.fury.io/js/kimetra)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/kimetra.svg)](https://nodejs.org)
[![Platform Support](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue.svg)](#platform-setup)

![Banner](https://raw.githubusercontent.com/saad-devx/kimetra/refs/heads/main/src/assets/banner.jpg)

Keyboard automation for Node.js, calling the OS input APIs directly through a
precompiled native addon: `SendInput` on Windows, `CGEvent` on macOS, `uinput`
on Linux.

- **Works on Wayland.** `uinput` reaches every app on Linux, on both X11 and Wayland.
- **One native call per sequence.** JavaScript never runs between key events.
- **Microsecond timing.** Waits target an absolute deadline instead of drifting.
- **No dependencies, no build step.** One binary per platform, under 150 KB installed.
- **The same key names everywhere.** `ctrl` is `ctrl` on all three platforms.

## Install

```bash
npm install kimetra
```

macOS and Linux need a one-time permission grant. See [platform setup](#platform-setup).

## Quick start

```javascript
const { Kimetra } = require('kimetra');
// or: import { Kimetra } from 'kimetra';

const ki = Kimetra();

await ki.pressKey('enter');
await ki.pressHotkey(['ctrl', 'c']);
await ki.pressKeys(['a', 'b', 'c']);
await ki.typeText('Hello from Kimetra');

ki.cleanup();
```

That is the whole surface for most scripts. Everything below is configuration,
key names, and the parts you reach for less often.

## From the terminal

Kimetra ships a `kimetra` command. Use it without installing anything:

```bash
npx kimetra key enter
npx kimetra hotkey ctrl+shift+escape
npx kimetra type "hello" key enter
```

Commands chain by writing them one after another, and the whole chain compiles
into a single native call:

```bash
kimetra hotkey alt+tab wait 200 type "hi" key enter
```

| Command | Does |
| --- | --- |
| `key <name>` | Press and release a key |
| `keys <name...>` | Press several keys in order |
| `hotkey <a+b+c>` | Press keys together |
| `repeat <name> <n>` | Press a key n times |
| `type <text>` | Type text, or `-` to read stdin |
| `wait <n>` | Pause |
| `run <file>` | Insert the actions from a macro file, or `-` for stdin |
| `list` | Print the key names this platform accepts |

| Option | Does |
| --- | --- |
| `-u, --unit <ms\|us>` | Unit for every number you pass (default `ms`) |
| `-d, --delay <n>` | Delay before each action starts |
| `-i, --interval <n>` | Gap between repeated actions |
| `-t, --duration <n>` | How long a single key is held |
| `-k, --hotkey-delay <n>` | How long a combination is held |
| `-n, --times <n>` | Run the whole chain n times |
| `--dry-run` | Print the compiled actions as JSON, send nothing |

**Numbers are milliseconds here**, not microseconds. A terminal is not the place
to think in microseconds; pass `--unit us` if you need to.

`--dry-run` writes the same JSON that `Kimacro` does, so the two are
interchangeable:

```bash
kimetra --dry-run hotkey ctrl+a type "hi" > login.json
kimetra run login.json key enter
cat notes.txt | kimetra type -
```

Exit codes are `0` for success, `1` for a failure while running, and `2` for a
mistake in the command line.

### A shorter name

The command is `kimetra` instead of `ki` to avoid collision because its already taken twice by:
 - [npm package](https://www.npmjs.com/package/ki) that installs a `ki` binary
 - Homebrew's [Kotlin Interactive Shell](https://formulae.brew.sh/formula/ki). 

Alias it yourself in one line:

```bash
echo "alias ki='kimetra'" >> ~/.bashrc     # bash, zsh
```

```powershell
Add-Content $PROFILE "Set-Alias ki kimetra"  # PowerShell
```

## Platform setup

macOS and Linux each need a one-time permission grant, and Kimetra throws with
these instructions if it is missing. Windows needs none.

### Windows

Nothing to configure, with one caveat: Windows blocks input from a normal
process to a window running as administrator. If the target app is elevated, run
your script elevated too.

### macOS

Open **System Settings > Privacy & Security > Accessibility** and enable the
application running your script: Terminal, iTerm, VS Code, or your packaged app.
If it is already listed, remove it, add it again, then restart the process.

macOS invalidates the grant whenever the binary's signature changes. Terminal's
"Secure Keyboard Entry" and focused password fields block synthetic input
entirely.

### Linux

Kimetra writes to `/dev/uinput`, which works on both X11 and Wayland but needs
permission:

```bash
echo 'KERNEL=="uinput", GROUP="input", MODE="0660"' | sudo tee /etc/udev/rules.d/99-kimetra.rules
sudo usermod -aG input $USER
```

Reboot afterwards, or run the process as root.

## Key names

Keys are plain strings, lower case, with no spaces or punctuation.

| Group | Names |
| --- | --- |
| Letters and digits | `a` to `z`, `0` to `9` |
| Function keys | `f1` to `f20` |
| Modifiers | `ctrl`, `shift`, `alt`, `meta`, each also as `l`/`r`: `lctrl`, `rshift`, … |
| Control | `enter`, `escape`, `space`, `tab`, `backspace`, `delete`, `capslock` |
| Navigation | `up`, `down`, `left`, `right`, `home`, `end`, `pageup`, `pagedown` |
| Numpad | `numpad0` to `numpad9`, `numpadadd`, `numpadsubtract`, `numpadmultiply`, `numpaddivide`, `numpaddecimal` |
| Symbols | `semicolon`, `equal`, `comma`, `hyphen`, `dot`, `fslash`, `bslash`, `grave`, `quote`, `squarebracketstart`, `squarebracketend` |
| Volume | `volumemute`, `volumedown`, `volumeup` |

`ctrl`, `shift`, `alt` and `meta` resolve to the left-hand key. Use `lctrl` or
`rctrl` when the side matters. `meta` is the Windows key, Command on macOS and
Super on Linux, and also answers to `cmd`, `win` and `super`.

Every name above works on all three platforms. Keys that only some platforms
have, such as `insert`, `printscreen`, `numlock`, the media transport keys and
the browser keys, throw where the OS has no such key. Your editor will flag them
through the TypeScript definitions.

## API

The package exports exactly three things.

```javascript
const { Kimetra, Kimacro, Key } = require('kimetra');
```

### Kimetra(options)

Every option is optional.

```javascript
const ki = Kimetra({
  unit: 'microsecond', // 'microsecond' (default) or 'millisecond'
  delay: 0,            // delay before an action starts
  interval: 700,       // gap between repeated actions
  duration: 700,       // how long a single key is held
  hotkeyDelay: 1500    // how long a combination is held before release
});
```

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

All of them return a promise. The instance also carries `os`, `arch` and `unit`.

### Units

`unit` decides how Kimetra reads the numbers **you** pass, in the options above
and in every method argument. It does not change the built-in defaults, which
are fixed real durations.

| Call | microsecond mode | millisecond mode |
| --- | --- | --- |
| `pressKey('a')` | 700 µs hold | 700 µs hold |
| `pressKey('a', 5)` | 5 µs hold | 5 ms hold |
| `sleep(500)` | 500 µs | 500 ms |

Pick a unit once and stay with it. The same snippet means different things under
different units.

```javascript
await ki.pressKey('shift', 2000000); // two seconds in microseconds
```

### Editing shortcuts

These resolve to the chord each platform actually uses: Cmd on macOS, Ctrl
elsewhere.

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
| `down` / `up` | `key`, `delay?` |
| `wait` | `duration` |

Every method above is a one-action sequence, so a method call and the matching
action behave identically.

### Kimacro(options)

A chainable builder over the same sequences. Use `executeSequence` for a one-off
list, and `Kimacro` when you want to replay or save one.

```javascript
const fs = require('fs');
const { Kimacro } = require('kimetra');

const macro = Kimacro()
  .pressKey('enter')
  .typeText('hello')
  .pressHotkey(['ctrl', 's'])
  .wait(1000000);

await macro.exec();
await macro.exec(); // runs again, the sequence is kept

fs.writeFileSync('login.json', JSON.stringify(macro.toJSON()));
await Kimacro().fromJSON(JSON.parse(fs.readFileSync('login.json'))).exec();
```

`Kimacro` takes the same options as `Kimetra`, and also has `add(action)`,
`clear()` and `cleanup()`.

### Low level access

Most scripts never need this. `ki.core` is the raw addon, working in key codes
and microseconds regardless of the instance options, which is what `Key` is for.

```javascript
const { Kimetra, Key } = require('kimetra');

const ki = Kimetra();

ki.core.KeyDown(Key.enter);
ki.core.Sleep(500);
ki.core.KeyUp(Key.enter);
```

`core` exposes `KeyDown`, `KeyUp`, `SendString`, `Sleep`, `Run` and `Cleanup`.
`Sleep` is more accurate than `setTimeout` and avoids the scheduling overhead of
returning to the event loop.

## Behaviour and limits

**Execution is synchronous.** The methods return promises so that `await` reads
naturally, but the work happens in a blocking native call. A one second wait
blocks the event loop for one second. Keep short waits inside sequences and long
pauses in JavaScript.

**Linux text is US ASCII.** `uinput` sends scan codes, so `typeText` on Linux can
only produce what a US QWERTY layout produces, and throws on anything else.
Windows and macOS inject unicode directly. Use the clipboard for unicode on
Linux.

**Layouts matter.** Key names describe physical keys. On a non-US layout, `quote`
is whatever your layout puts on that key.

**Newline and tab** are sent as real Enter and Tab presses on every platform.
Carriage returns are ignored, so CRLF text types one newline.

## Under the hood

Kimetra ships one C++ addon per platform and architecture. Nothing is compiled at
install time; the post-install step deletes the binaries and key maps your
machine cannot use. The npm download carries all six, so it is larger than the
installed footprint.

Supported targets are `win32-x64`, `win32-ia32`, `darwin-x64`, `darwin-arm64`,
`linux-x64` and `linux-ia32`, on Node 16 or newer. Anything else, including
`linux-arm64` and Alpine, fails at require time with a message naming your
platform.

The binaries are not committed to this repository. They are compiled from
`src/cpp` by the GitHub Actions workflow and injected at publish time, and every
release ships with [npm provenance](https://docs.npmjs.com/generating-provenance-statements),
which ties the tarball to the commit and workflow that produced it. Verify it
with `npm audit signatures`.

To build them yourself you need Python 3 and a C++ toolchain (MSVC on Windows,
Xcode command line tools on macOS, `build-essential` on Linux):

```bash
npm install node-addon-api && npx node-gyp configure build
```

That produces `build/Release/kimetra.node`. Copy it into `src/bin` under the
name for your platform and architecture, for example `src/bin/win32x64.node`,
then run `npm test`.

## License

MIT © Saad
