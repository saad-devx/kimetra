'use strict';

const OS = process.platform;
const ARCH = process.arch;

// Batch layout: [op, a, b] int32 records, mirrored in src/cpp/backend.h.
const BATCH_FORMAT = 2;
const OP_DOWN = 0;
const OP_UP = 1;
const OP_SLEEP = 2;
const OP_TEXT = 3;

// Gap between key events of a combination, so apps register a modifier in time.
const KEY_GAP = 1000;

// Batch slots are int32.
const MAX_MICROS = 2147483647;
const MAX_KEYCODE = 65535;

const TARGETS = 'win32-x64, win32-ia32, darwin-x64, darwin-arm64, linux-x64, linux-ia32';

const REJECTED = OS === 'win32'
    ? 'The OS rejected the input. The focused window is most likely running elevated, ' +
      'in which case this process has to run elevated as well.'
    : 'The OS rejected the input.';

function loadKeymap() {
    try {
        return require('./core/' + OS + '.js');
    } catch (err) {
        if (err && err.code !== 'MODULE_NOT_FOUND') throw err;
        throw new Error(`Kimetra does not support "${OS}". Supported platforms: win32, darwin, linux.`);
    }
}

function loadBinary() {
    try {
        return require('./bin/' + OS + ARCH + '.node');
    } catch (err) {
        throw new Error(
            `Kimetra has no prebuilt binary for ${OS}-${ARCH}. Supported targets: ${TARGETS}. ` +
            `(${err.message})`
        );
    }
}

const Key = Object.freeze(loadKeymap());
const Binary = loadBinary();

/** Formats a rejected value for an error message. */
function describe(value) {
    return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

/** Resolves a key name to its platform code. Raw codes pass through unchanged. */
function code(key) {
    if (typeof key === 'number') {
        if (!Number.isInteger(key) || key < 0 || key > MAX_KEYCODE) {
            throw new RangeError(
                `Invalid key code ${describe(key)}. Expected a whole number from 0 to ${MAX_KEYCODE}.`
            );
        }
        return key;
    }

    const resolved = Key[key];
    if (resolved === undefined) {
        throw new Error(`Unknown key "${key}" on ${OS}.`);
    }
    return resolved;
}

function codes(keys, type) {
    if (!Array.isArray(keys)) {
        throw new TypeError(`${type} needs an array of keys, received ${describe(keys)}.`);
    }
    return keys.map(code);
}

function count(times) {
    if (!Number.isInteger(times) || times < 0) {
        throw new TypeError(`repeat needs a whole number of times, received ${describe(times)}.`);
    }
    return times;
}

// Resolved to key codes once, at load.
const MOD = OS === 'darwin' ? 'meta' : 'ctrl';

const SHORTCUTS = {
    copy: [MOD, 'c'],
    paste: [MOD, 'v'],
    cut: [MOD, 'x'],
    selectAll: [MOD, 'a'],
    undo: [MOD, 'z'],
    save: [MOD, 's'],
    find: [MOD, 'f'],
    redo: OS === 'win32' ? ['ctrl', 'y'] : [MOD, 'shift', 'z'],
    replace: OS === 'darwin' ? ['meta', 'alt', 'f'] : ['ctrl', 'h']
};

for (const name of Object.keys(SHORTCUTS)) {
    SHORTCUTS[name] = codes(SHORTCUTS[name], name);
}

class Kimetra {
    constructor(options) {
        const opts = options || {};
        const scale = opts.unit === 'millisecond' ? 1000 : 1;

        this.os = OS;
        this.arch = ARCH;
        this.core = Binary;
        this.unit = scale === 1000 ? 'millisecond' : 'microsecond';

        // Defaults are microseconds; only caller values are scaled.
        this._scale = scale;
        this.delay = this._us(opts.delay, 0, 'delay');
        this.interval = this._us(opts.interval, 700, 'interval');
        this.duration = this._us(opts.duration, 700, 'duration');
        this.hotkeyDelay = this._us(opts.hotkeyDelay, 1500, 'hotkeyDelay');

        this._ops = new Int32Array(64);
        this._len = 0;
        this._texts = [];
    }

    // Each method is a one-action sequence; validation lives in _compile.

    /** Presses a key down and leaves it held. */
    keyDown(key, delay) {
        return this.executeSequence([{ type: 'down', key, delay }]);
    }

    /** Releases a held key. */
    keyUp(key, delay) {
        return this.executeSequence([{ type: 'up', key, delay }]);
    }

    /** Presses and releases a key, holding it down for `duration`. */
    pressKey(key, duration, delay) {
        return this.executeSequence([{ type: 'key', key, duration, delay }]);
    }

    /** Presses several keys one after another. */
    pressKeys(keys, interval, delay) {
        return this.executeSequence([{ type: 'keys', keys, interval, delay }]);
    }

    /** Presses keys together as a combination, releasing them in reverse order. */
    pressHotkey(keys, duration, delay) {
        return this.executeSequence([{ type: 'hotkey', keys, duration, delay }]);
    }

    /** Presses the same key `times` times. */
    repeatKey(key, times, interval, delay) {
        return this.executeSequence([{ type: 'repeat', key, times, interval, delay }]);
    }

    /** Types text. Unicode is supported on Windows and macOS. */
    typeText(text, delay) {
        return this.executeSequence([{ type: 'text', text, delay }]);
    }

    /** Blocks for `duration` with microsecond accuracy. */
    async sleep(duration) {
        if (duration === undefined) {
            throw new TypeError('sleep needs a duration.');
        }

        Binary.Sleep(this._us(duration, 0, 'sleep duration'));
        return true;
    }

    /** Compiles an entire action list into a single native call. */
    async executeSequence(actions) {
        if (!Array.isArray(actions)) {
            throw new TypeError(
                `executeSequence needs an array of actions, received ${describe(actions)}.`
            );
        }

        try {
            this._compile(actions);
        } catch (err) {
            // Drop the partial batch so the next call can't replay it.
            this._len = 0;
            this._texts.length = 0;
            throw err;
        }

        return this._run();
    }

    /** Releases native resources. Safe to call more than once. */
    cleanup() {
        this._len = 0;
        this._texts.length = 0;
        Binary.Cleanup();
    }

    _compile(actions) {
        for (const action of actions) {
            const delay = this._us(action.delay, this.delay, 'delay');

            switch (action.type) {
                case 'down':
                case 'up': {
                    const keyCode = code(action.key);
                    if (delay > 0) this._push(OP_SLEEP, delay);
                    this._push(action.type === 'down' ? OP_DOWN : OP_UP, keyCode);
                    break;
                }
                case 'key':
                    this._buildKey(
                        code(action.key),
                        this._us(action.duration, this.duration, 'duration'),
                        delay
                    );
                    break;
                case 'keys':
                    this._buildSeries(
                        codes(action.keys, 'keys'),
                        this._us(action.interval, this.interval, 'interval'),
                        delay
                    );
                    break;
                case 'repeat':
                    this._buildSeries(
                        new Array(count(action.times)).fill(code(action.key)),
                        this._us(action.interval, this.interval, 'interval'),
                        delay
                    );
                    break;
                case 'hotkey':
                    this._buildHotkey(
                        codes(action.keys, 'hotkey'),
                        this._us(action.duration, this.hotkeyDelay, 'duration'),
                        delay
                    );
                    break;
                case 'text':
                    this._buildText(action.text, delay);
                    break;
                case 'wait':
                    if (action.duration === undefined) {
                        throw new TypeError('A "wait" action needs a duration.');
                    }
                    this._push(OP_SLEEP, this._us(action.duration, 0, 'wait duration'));
                    break;
                default:
                    throw new Error(`Unknown action type "${action.type}".`);
            }
        }
    }

    _us(value, fallback, name) {
        if (value === undefined) return fallback;

        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
            throw new TypeError(`${name} must be a non-negative number, received ${describe(value)}.`);
        }

        const micros = value * this._scale;
        if (micros > MAX_MICROS) {
            throw new RangeError(
                `${name} of ${value} exceeds the maximum of ` +
                `${Math.floor(MAX_MICROS / this._scale)} ${this.unit}s.`
            );
        }
        return micros;
    }

    _push(op, a, b = 0) {
        if (this._len + 3 > this._ops.length) {
            const grown = new Int32Array(this._ops.length * 2);
            grown.set(this._ops);
            this._ops = grown;
        }
        this._ops[this._len++] = op;
        this._ops[this._len++] = a;
        this._ops[this._len++] = b;
    }

    _buildKey(keyCode, duration, delay) {
        if (delay > 0) this._push(OP_SLEEP, delay);
        this._push(OP_DOWN, keyCode);
        if (duration > 0) this._push(OP_SLEEP, duration);
        this._push(OP_UP, keyCode);
    }

    _buildSeries(keyCodes, interval, delay) {
        if (delay > 0) this._push(OP_SLEEP, delay);
        for (let i = 0; i < keyCodes.length; i++) {
            if (i > 0 && interval > 0) this._push(OP_SLEEP, interval);
            this._push(OP_DOWN, keyCodes[i]);
            if (this.duration > 0) this._push(OP_SLEEP, this.duration);
            this._push(OP_UP, keyCodes[i]);
        }
    }

    // Down in order, up in reverse, KEY_GAP apart. The hold includes one gap.
    _buildHotkey(keyCodes, duration, delay) {
        if (delay > 0) this._push(OP_SLEEP, delay);

        const n = keyCodes.length;
        for (let i = 0; i < n; i++) {
            if (i > 0) this._push(OP_SLEEP, KEY_GAP);
            this._push(OP_DOWN, keyCodes[i]);
        }

        if (n > 0) this._push(OP_SLEEP, Math.min(KEY_GAP + duration, MAX_MICROS));

        for (let i = n - 1; i >= 0; i--) {
            this._push(OP_UP, keyCodes[i]);
            if (i > 0) this._push(OP_SLEEP, KEY_GAP);
        }
    }

    _buildText(text, delay) {
        if (typeof text !== 'string') {
            throw new TypeError(`text must be a string, received ${describe(text)}.`);
        }

        if (delay > 0) this._push(OP_SLEEP, delay);
        this._texts.push(text);
        this._push(OP_TEXT, this._texts.length - 1);
    }

    /** Hands the whole batch to native in one call and resets the buffer. */
    _run() {
        const length = this._len;
        const texts = this._texts;
        this._len = 0;

        if (Binary.Format !== BATCH_FORMAT) {
            texts.length = 0;
            throw new Error(
                `The Kimetra binary for ${OS}-${ARCH} is out of date. Reinstall kimetra, ` +
                'or rebuild it from source.'
            );
        }

        let ok;
        try {
            ok = Binary.Run(this._ops, length, texts);
        } finally {
            texts.length = 0;
        }

        if (ok === false) throw new Error(REJECTED);
        return true;
    }
}

// Editing shortcuts: Cmd on macOS, Ctrl elsewhere.
for (const name of Object.keys(SHORTCUTS)) {
    const keys = SHORTCUTS[name];
    Kimetra.prototype[name] = function (duration, delay) {
        return this.pressHotkey(keys, duration, delay);
    };
}

class Kimacro {
    constructor(options) {
        this.ki = new Kimetra(options);
        this.sequence = [];
    }

    add(action) {
        if (!action || typeof action !== 'object') {
            throw new TypeError(`add needs an action object, received ${describe(action)}.`);
        }

        // Copy without unset fields; the caller's object is left untouched.
        const copy = {};
        for (const field of Object.keys(action)) {
            if (action[field] !== undefined) copy[field] = action[field];
        }

        this.sequence.push(copy);
        return this;
    }

    pressKey(key, duration, delay) {
        return this.add({ type: 'key', key, duration, delay });
    }

    pressKeys(keys, interval, delay) {
        return this.add({ type: 'keys', keys, interval, delay });
    }

    pressHotkey(keys, duration, delay) {
        return this.add({ type: 'hotkey', keys, duration, delay });
    }

    repeatKey(key, times, interval, delay) {
        return this.add({ type: 'repeat', key, times, interval, delay });
    }

    typeText(text, delay) {
        return this.add({ type: 'text', text, delay });
    }

    wait(duration) {
        return this.add({ type: 'wait', duration });
    }

    /** Runs the macro. The sequence is kept, so a macro can be replayed. */
    exec() {
        return this.ki.executeSequence(this.sequence);
    }

    toJSON() {
        return this.sequence.slice();
    }

    fromJSON(sequence) {
        if (!Array.isArray(sequence)) {
            throw new Error('fromJSON expects an array of action objects.');
        }
        this.sequence = sequence.slice();
        return this;
    }

    clear() {
        this.sequence.length = 0;
        return this;
    }

    cleanup() {
        this.ki.cleanup();
    }
}

module.exports = {
    Kimetra: options => new Kimetra(options),
    Kimacro: options => new Kimacro(options),
    Key
};
