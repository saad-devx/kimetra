# Kimetra

[![npm version](https://badge.fury.io/js/kimetra.svg)](https://badge.fury.io/js/kimetra)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/kimetra.svg)](https://nodejs.org)
[![Platform Support](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue.svg)](#platform-setup)

![Banner](https://raw.githubusercontent.com/saad-devx/kimetra/refs/heads/main/src/assets/banner.jpg)

Keyboard and mouse automation for Node.js, calling the OS input APIs directly
through a precompiled native addon: `SendInput` on Windows, `CGEvent` on macOS,
`uinput` on Linux.

- **Works on Wayland.** `uinput` reaches every app on Linux, on both X11 and Wayland.
- **One native call per sequence.** JavaScript never runs between input events.
- **Microsecond timing.** Waits target an absolute deadline instead of drifting.
- **No dependencies, no build step.** One binary per platform, under 200 KB installed.
- **The same key names everywhere.** `ctrl` is `ctrl` on all three platforms.

## Benchmarks

Every library sends real input to a browser page that records when each event arrives,
and every run is checked for correctness. Windows 11, Node 22, medians of 3 runs. Lower
is better everywhere. [Method, full results and how to reproduce](bench/README.md).

| Timing error | | |
| --- | --- | --- |
| **Kimetra** | `█` | **0.9 ms** |
| robotjs 0.9.1 | `██████████` | 11.0 ms |
| nut.js 4.2.6 | `████████████████████████` | 25.5 ms |

How far events landed from their planned time, median over typing, a game macro and a
mouse workflow.

| Overhead | | |
| --- | --- | --- |
| **Kimetra** | `██` | **0.35 s** |
| robotjs 0.9.1 | `████████` | 1.66 s |
| nut.js 4.2.6 | `████████████████████████` | 4.87 s |

Time added on top of 15.6 s of scripted scenarios: typing, a form, a game macro and a
mouse workflow.

| Installed size | | |
| --- | --- | --- |
| **Kimetra** | `█` | **188 KB**, 1 package |
| robotjs 0.9.1 | `███` | 2.6 MB, 3 packages |
| nut.js 4.2.6 | `████████████████████████` | 28.6 MB, 125 packages |

`node_modules` after `npm install` on Windows x64, dependencies included.

The first two use Kimetra's sequences, where a whole script runs as one native call.
Called one action at a time with `setTimeout` waits in between, Kimetra performs like
robotjs, and raw key throughput is the same for both because that time is spent inside
the OS.

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
await ki.click();

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
| `move <x> <y> [time]` | Move the pointer to x, y, gliding over `time` if given |
| `moveby <dx> <dy> [time]` | Move the pointer by dx, dy |
| `click [button] [n]` | Click n times (default: left, once) |
| `mousedown [button]`, `mouseup [button]` | Press and hold a button, release it |
| `scroll <down> [right]` | Scroll by notches; negative values go up and left |
| `wait <time>` | Pause |
| `run <file>` | Insert the actions from a macro file, or `-` for stdin |
| `list` | Print the key names this platform accepts |

| Option | Does |
| --- | --- |
| `-u, --unit <ms\|us>` | Unit for every time you pass (default `ms`) |
| `-d, --delay <time>` | Delay before each action starts |
| `-i, --interval <time>` | Gap between repeated actions |
| `-t, --duration <time>` | How long a key or button is held |
| `-k, --hotkey-delay <time>` | How long a combination is held |
| `-n, --times <n>` | Run the whole chain n times |
| `--dry-run` | Print the compiled actions as JSON, send nothing |

**Times are milliseconds here**, not microseconds. A terminal is not the place
to think in microseconds; pass `--unit us` if you need to. Coordinates are never
scaled.

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
  duration: 700,       // how long a key or mouse button is held
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
| `mousePosition()` | The pointer position as `{ x, y }`. See [mouse](#mouse). |
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

### Mouse

```javascript
await ki.moveMouse(800, 400);            // move to x, y
await ki.moveMouse(800, 400, 250000);    // glide there over 250 ms (microsecond mode)
await ki.moveMouseBy(40, 0);             // move relative to where the pointer is
await ki.click();                        // left click
await ki.click('right', 2);              // double click with the right button
await ki.scroll(3);                      // 3 notches down; negative scrolls up

await ki.mouseDown();                    // drag: press, move, release
await ki.moveMouse(600, 300, 200000);
await ki.mouseUp();

const { x, y } = ki.mousePosition();
```

| Method | Description |
| --- | --- |
| `moveMouse(x, y, duration?, delay?)` | Move the pointer to x, y. With `duration`, glide there in steps 4 ms apart. |
| `moveMouseBy(x, y, duration?, delay?)` | Move the pointer by x, y. |
| `click(button?, count?, delay?)` | Click `count` times. Defaults to one left click. |
| `mouseDown(button?, delay?)` | Press a button and leave it held. |
| `mouseUp(button?, delay?)` | Release a held button. |
| `scroll(y, x?, delay?)` | Scroll `y` notches down and `x` notches right. Negative values go up and left. |

Buttons are `left`, `right`, `middle`, `back` and `forward`. A click holds the button
for `duration` and spaces the clicks of a double click by `interval`, like keys.

Coordinates are in each OS's own units: physical pixels on Windows, whatever the
display scaling, and points on macOS, where one point is two pixels on a Retina
display. They span every monitor, with (0, 0) at the top left of the main one.

Relative moves go through the OS pointer speed and acceleration settings, as a real
mouse does, so `moveMouseBy(100, 0)` can move the cursor more or less than 100
pixels. Games that read raw mouse input receive the exact amounts.

On Linux, `moveMouse` and `mousePosition` are not available yet, because `uinput`
cannot see the pointer or the screen layout. Relative moves, clicks and scrolling
work, on X11 and Wayland.

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
  { type: 'keys', keys: ['a', 'b'], interval: 2000 },
  { type: 'click', button: 'left' }
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
| `move` / `moveby` | `x`, `y`, `duration?`, `delay?` |
| `click` | `button?`, `count?`, `delay?` |
| `mousedown` / `mouseup` | `button?`, `delay?` |
| `scroll` | `y`, `x?`, `delay?` |
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

`Kimacro` takes the same options as `Kimetra` and has every action method above,
plus `wait(duration)`, `add(action)`, `clear()` and `cleanup()`.

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

`core` exposes `KeyDown`, `KeyUp`, `SendString`, `Sleep`, `Run`, `MousePosition` and
`Cleanup`.
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
