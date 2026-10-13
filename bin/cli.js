#!/usr/bin/env node
'use strict';

/**
 * Kimetra command line interface.
 *
 * Commands are chained by writing them one after another. The whole chain
 * compiles into a single native call, so a chain costs no more than one
 * process start.
 */

const HELP = `kimetra - keyboard and mouse automation from the terminal

Usage
  kimetra <command> [args] [<command> [args] ...] [options]

Keyboard
  key <name>              Press and release a key
  keys <name...>          Press several keys in order
  hotkey <a+b+c>          Press keys together, release in reverse
  repeat <name> <n>       Press a key n times
  type <text>             Type text, or "-" to read stdin

Mouse
  move <x> <y> [time]     Move the pointer to x, y, gliding over time if given
  moveby <dx> <dy> [time] Move the pointer by dx, dy
  click [button] [n]      Click n times (default: left, once)
  mousedown [button]      Press a button and hold it
  mouseup [button]        Release a held button
  scroll <down> [right]   Scroll by notches; negative values go up and left

Other
  wait <time>             Pause
  run <file>              Insert the actions from a macro JSON file, or "-" for stdin
  list                    Print the key names this platform accepts

Buttons are left, right, middle, back and forward.

Options
  -u, --unit <ms|us>      Unit for every time (default: ms)
  -d, --delay <time>      Delay before each action starts
  -i, --interval <time>   Gap between repeated actions
  -t, --duration <time>   How long a key or button is held
  -k, --hotkey-delay <time>  How long a combination is held
  -n, --times <n>         Run the whole chain n times
      --dry-run           Print the compiled actions as JSON, send nothing
  -h, --help              Show this help
  -v, --version           Show the version

Examples
  kimetra key enter
  kimetra hotkey ctrl+shift+escape
  kimetra type "hello" key enter
  kimetra hotkey alt+tab wait 200 type "hi" key enter
  kimetra move 800 400 click
  kimetra mousedown move 600 400 300 mouseup
  echo "some text" | kimetra type -
  kimetra --dry-run hotkey ctrl+a type "hi" > macro.json && kimetra run macro.json

Times are milliseconds unless --unit us is given.`;

/** A mistake in the command line itself, as opposed to a failure while running. */
class UsageError extends Error {}

// Command words. `keys` reads key names until the next one of these.
const COMMANDS = new Set([
    'key', 'keys', 'hotkey', 'repeat', 'type',
    'move', 'moveby', 'click', 'mousedown', 'mouseup', 'scroll',
    'wait', 'run', 'list'
]);

const BUTTONS = ['left', 'right', 'middle', 'back', 'forward'];

const isNumber = token => token.trim() !== '' && Number.isFinite(Number(token));
const isButton = token => BUTTONS.includes(token);

function number(raw, name) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
        throw new UsageError(`${name} must be a non-negative number, received "${raw}".`);
    }
    return value;
}

function coordinate(raw, name) {
    if (!isNumber(raw)) {
        throw new UsageError(`${name} must be a number, received "${raw}".`);
    }
    return Number(raw);
}

function count(raw, name) {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
        throw new UsageError(`${name} must be a whole number of at least 1, received "${raw}".`);
    }
    return value;
}

function splitHotkey(spec) {
    const keys = spec.split('+');
    if (keys.length < 2 || keys.some(k => k === '')) {
        throw new UsageError(
            `hotkey takes keys joined by "+", such as ctrl+c. Received "${spec}".`
        );
    }
    return keys;
}

function readStdin(what) {
    if (process.stdin.isTTY) {
        throw new UsageError(`${what} "-" reads stdin, but nothing is piped in.`);
    }
    return require('fs').readFileSync(0, 'utf8');
}

/** Drops one trailing newline, so `echo hi | kimetra type -` does not press Enter. */
function chomp(text) {
    return text.replace(/\r?\n$/, '');
}

function loadMacro(source) {
    const raw = source === '-'
        ? readStdin('run')
        : require('fs').readFileSync(source, 'utf8');

    let actions;
    try {
        actions = JSON.parse(raw);
    } catch (err) {
        throw new UsageError(`${source} is not valid JSON. ${err.message}`);
    }

    if (!Array.isArray(actions)) {
        throw new UsageError(`${source} must contain an array of actions.`);
    }
    return actions;
}

// Typed numbers are scaled to microseconds, so macro files match Kimacro().toJSON().
const SCALED_FIELDS = ['duration', 'delay', 'interval'];

function toMicroseconds(actions, borrowed, factor) {
    if (factor === 1) return actions;

    return actions.map((action, index) => {
        if (borrowed.has(index)) return action; // already microseconds
        const out = Object.assign({}, action);
        for (const field of SCALED_FIELDS) {
            if (typeof out[field] === 'number') out[field] *= factor;
        }
        return out;
    });
}

function parse(argv) {
    const options = {};
    const actions = [];
    const borrowed = new Set(); // indices that came from a macro file
    const flags = { times: 1, dryRun: false, help: false, version: false, list: false };

    let unit = 'ms';
    let i = 0;

    // Single pass, so an argument starting with "-" is not taken for a flag.
    const next = (command, what) => {
        if (i + 1 >= argv.length) {
            throw new UsageError(`${command} needs ${what}.`);
        }
        return argv[++i];
    };

    // An optional argument, taken only when the next token is not a command and fits.
    const maybe = fits => {
        const peek = argv[i + 1];
        if (peek === undefined || COMMANDS.has(peek) || !fits(peek)) return undefined;
        i++;
        return peek;
    };

    for (; i < argv.length; i++) {
        const token = argv[i];

        switch (token) {
            case '-h': case '--help': flags.help = true; continue;
            case '-v': case '--version': flags.version = true; continue;
            case '--dry-run': flags.dryRun = true; continue;
            case '-u': case '--unit': {
                unit = next(token, 'ms or us');
                if (unit !== 'ms' && unit !== 'us') {
                    throw new UsageError(`--unit takes "ms" or "us", received "${unit}".`);
                }
                continue;
            }
            case '-d': case '--delay':
                options.delay = number(next(token, 'a number'), '--delay');
                continue;
            case '-i': case '--interval':
                options.interval = number(next(token, 'a number'), '--interval');
                continue;
            case '-t': case '--duration':
                options.duration = number(next(token, 'a number'), '--duration');
                continue;
            case '-k': case '--hotkey-delay':
                options.hotkeyDelay = number(next(token, 'a number'), '--hotkey-delay');
                continue;
            case '-n': case '--times':
                flags.times = count(next(token, 'a number'), '--times');
                continue;

            case 'key':
                actions.push({ type: 'key', key: next(token, 'a key name') });
                continue;
            case 'hotkey':
                actions.push({ type: 'hotkey', keys: splitHotkey(next(token, 'keys joined by "+"')) });
                continue;
            case 'repeat':
                actions.push({
                    type: 'repeat',
                    key: next(token, 'a key name'),
                    times: count(next(token, 'a count'), 'repeat')
                });
                continue;
            case 'type': {
                const text = next(token, 'some text');
                actions.push({ type: 'text', text: text === '-' ? chomp(readStdin('type')) : text });
                continue;
            }
            case 'move':
            case 'moveby': {
                const x = coordinate(next(token, 'x and y'), `${token} x`);
                const y = coordinate(next(token, 'x and y'), `${token} y`);
                const time = maybe(isNumber);
                const action = { type: token, x, y };
                if (time !== undefined) action.duration = number(time, `${token} time`);
                actions.push(action);
                continue;
            }
            case 'click': {
                const action = { type: 'click' };
                const name = maybe(isButton);
                const times = maybe(isNumber);
                if (name !== undefined) action.button = name;
                if (times !== undefined) action.count = count(times, 'click');
                actions.push(action);
                continue;
            }
            case 'mousedown':
            case 'mouseup': {
                const action = { type: token };
                const name = maybe(isButton);
                if (name !== undefined) action.button = name;
                actions.push(action);
                continue;
            }
            case 'scroll': {
                const action = { type: 'scroll', y: coordinate(next(token, 'an amount'), 'scroll') };
                const right = maybe(isNumber);
                if (right !== undefined) action.x = Number(right);
                actions.push(action);
                continue;
            }
            case 'wait':
                actions.push({ type: 'wait', duration: number(next(token, 'a number'), 'wait') });
                continue;
            case 'run':
                for (const action of loadMacro(next(token, 'a file name'))) {
                    borrowed.add(actions.length);
                    actions.push(action);
                }
                continue;
            case 'list':
                flags.list = true;
                continue;

            case 'keys': {
                const keys = [];
                while (i + 1 < argv.length && !COMMANDS.has(argv[i + 1]) && argv[i + 1][0] !== '-') {
                    keys.push(argv[++i]);
                }
                if (keys.length === 0) throw new UsageError('keys needs at least one key name.');
                actions.push({ type: 'keys', keys });
                continue;
            }

            default:
                throw new UsageError(
                    token[0] === '-'
                        ? `Unknown option "${token}". Run kimetra --help.`
                        : `Unknown command "${token}". Run kimetra --help.`
                );
        }
    }

    const factor = unit === 'ms' ? 1000 : 1;
    for (const field of SCALED_FIELDS.concat('hotkeyDelay')) {
        if (typeof options[field] === 'number') options[field] *= factor;
    }
    options.unit = 'microsecond';

    return { options, actions: toMicroseconds(actions, borrowed, factor), flags };
}

async function main() {
    const { options, actions, flags } = parse(process.argv.slice(2));

    // No addon needed, so these work even where Kimetra has no binary.
    if (flags.help || process.argv.length === 2) {
        console.log(HELP);
        return 0;
    }
    if (flags.version) {
        console.log(require('../package.json').version);
        return 0;
    }

    const { Kimetra, Key } = require('../src/kimetra.js');

    if (flags.list) {
        console.log(Object.keys(Key).sort().join('\n'));
        return 0;
    }

    if (actions.length === 0) {
        throw new UsageError('Nothing to do. Run kimetra --help.');
    }

    if (flags.dryRun) {
        console.log(JSON.stringify(actions, null, 2));
        return 0;
    }

    const ki = Kimetra(options);
    try {
        // One native call per pass keeps Ctrl-C responsive between passes.
        for (let pass = 0; pass < flags.times; pass++) {
            await ki.executeSequence(actions);
        }
    } finally {
        ki.cleanup();
    }

    return 0;
}

main().then(
    code => { process.exitCode = code; },
    err => {
        console.error(err instanceof UsageError ? err.message : `kimetra: ${err.message}`);
        process.exitCode = err instanceof UsageError ? 2 : 1;
    }
);
