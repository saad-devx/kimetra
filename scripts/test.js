/**
 * Kimetra test suite.
 *
 * No test sends a real key event. Batches are compiled and inspected instead, so
 * the suite is safe to run on a desktop and on a headless CI machine.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const { Kimetra, Kimacro, Key } = require('..');

const OP_DOWN = 0;
const OP_UP = 1;
const OP_SLEEP = 2;
const OP_TEXT = 3;
const OP_MOVE = 4;
const OP_BUTTON_DOWN = 5;
const OP_BUTTON_UP = 6;
const OP_SCROLL = 7;
const OP_MOVE_BY = 8;

const LINUX = process.platform === 'linux';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

/**
 * Replaces the native call with a capture, so nothing reaches the OS. `records` holds
 * every op as [op, a, b]; `ops` drops the third slot, which key ops leave at zero.
 */
function capture(ki) {
    let records = null;
    let texts = null;

    ki._run = function () {
        records = [];
        for (let i = 0; i < this._len; i += 3) {
            records.push([this._ops[i], this._ops[i + 1], this._ops[i + 2]]);
        }
        texts = this._texts.slice();
        this._len = 0;
        this._texts.length = 0;
        return true;
    };

    return () => ({ ops: records.map(r => [r[0], r[1]]), records, texts });
}

const sum = (records, op) => records.filter(r => r[0] === op).reduce((total, r) => total + r[1], 0);

// Entry points

test('the package entry exports exactly Kimetra, Kimacro and Key', () => {
    const api = require('..');
    assert.deepStrictEqual(Object.keys(api).sort(), ['Key', 'Kimacro', 'Kimetra']);
    assert.strictEqual(typeof api.Kimetra, 'function');
    assert.strictEqual(typeof api.Kimacro, 'function');
    assert.strictEqual(typeof api.Key, 'object');
});

test('ESM entry loads and exposes the same three names', async () => {
    const url = pathToFileURL(path.resolve(__dirname, '../index.mjs')).href;
    const mod = await import(url);
    assert.strictEqual(typeof mod.Kimetra, 'function');
    assert.strictEqual(typeof mod.Kimacro, 'function');
    assert.strictEqual(typeof mod.Key, 'object');
});

// Key map

test('undirected modifiers exist and match the left-hand key', () => {
    for (const [plain, left] of [['ctrl', 'lctrl'], ['shift', 'lshift'], ['alt', 'lalt'], ['meta', 'lmeta']]) {
        assert.strictEqual(typeof Key[plain], 'number', `${plain} is missing`);
        assert.strictEqual(Key[plain], Key[left], `${plain} should equal ${left}`);
    }
});

test('every portable key is present on this platform', () => {
    const portable = [
        'a', 'z', '0', '9', 'f1', 'f12', 'f20',
        'shift', 'ctrl', 'alt', 'meta', 'super', 'cmd', 'win',
        'backspace', 'tab', 'enter', 'escape', 'space', 'capslock', 'delete',
        'left', 'up', 'right', 'down', 'home', 'end', 'pageup', 'pagedown',
        'numpad0', 'numpad9', 'numpadadd', 'numpaddivide',
        'semicolon', 'equal', 'comma', 'hyphen', 'dot', 'fslash',
        'grave', 'backtick', 'squarebracketstart', 'bslash', 'squarebracketend', 'quote',
        'volumemute', 'volumedown', 'volumeup'
    ];

    for (const name of portable) {
        assert.strictEqual(typeof Key[name], 'number', `${name} is missing on ${process.platform}`);
    }
});

test('Key is frozen', () => {
    assert.strictEqual(Object.isFrozen(Key), true);
});

// Options

test('defaults are microseconds', () => {
    for (const ki of [Kimetra(), Kimetra(null)]) {
        assert.strictEqual(ki.unit, 'microsecond');
        assert.strictEqual(ki.delay, 0);
        assert.strictEqual(ki.interval, 700);
        assert.strictEqual(ki.duration, 700);
        assert.strictEqual(ki.hotkeyDelay, 1500);
    }
});

test('millisecond unit scales supplied values but not defaults', () => {
    const ki = Kimetra({ unit: 'millisecond', duration: 2 });
    assert.strictEqual(ki.unit, 'millisecond');
    assert.strictEqual(ki.duration, 2000);
    assert.strictEqual(ki.interval, 700);
});

test('millisecond unit scales per-call arguments', async () => {
    const ki = Kimetra({ unit: 'millisecond' });
    const taken = capture(ki);
    await ki.pressKey('a', 5);
    assert.deepStrictEqual(taken().ops[1], [OP_SLEEP, 5000]);
});

// Key resolution

test('an unknown key name throws a useful error', async () => {
    const ki = Kimetra();
    await assert.rejects(() => ki.pressKey('entre'), /Unknown key "entre"/);
});

test('names inherited from Object.prototype are not keys', async () => {
    const ki = Kimetra();
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
        await assert.rejects(() => ki.pressKey(name), /Unknown key/, name);
    }
});

test('a raw code from Key passes through', async () => {
    const ki = Kimetra();
    const taken = capture(ki);
    await ki.pressKey(Key.enter);
    assert.strictEqual(taken().ops[0][1], Key.enter);
});

// Input validation

test('a raw key code outside the valid range is rejected', async () => {
    const ki = Kimetra();
    await assert.rejects(() => ki.pressKey(NaN), /Invalid key code NaN/);
    await assert.rejects(() => ki.pressKey(-1), /Invalid key code -1/);
    await assert.rejects(() => ki.pressKey(1.5), /Invalid key code 1.5/);
});

test('arguments that must be arrays are checked', async () => {
    const ki = Kimetra();
    await assert.rejects(() => ki.pressHotkey('ctrl'), /hotkey needs an array of keys/);
    await assert.rejects(() => ki.pressKeys('abc'), /keys needs an array of keys/);
    await assert.rejects(() => ki.executeSequence('key enter'), /needs an array of actions/);
});

test('repeatKey takes a whole count, and zero presses nothing', async () => {
    const ki = Kimetra();
    const taken = capture(ki);

    await assert.rejects(() => ki.repeatKey('a'), /repeat needs a whole number of times/);
    await assert.rejects(() => ki.repeatKey('a', 2.5), /repeat needs a whole number of times/);
    await assert.rejects(() => ki.repeatKey('a', -1), /repeat needs a whole number of times/);

    await ki.repeatKey('a', 0);
    assert.deepStrictEqual(taken().ops, []);
});

test('typeText requires a string', async () => {
    const ki = Kimetra();
    await assert.rejects(() => ki.typeText(undefined), /text must be a string, received undefined/);
    await assert.rejects(() => ki.typeText(42), /text must be a string, received 42/);
    await assert.rejects(() => ki.typeText(null), /text must be a string, received null/);
});

test('durations must be finite, non-negative and inside the int32 range', async () => {
    const ki = Kimetra();
    await assert.rejects(() => ki.pressKey('a', -5), /duration must be a non-negative number/);
    await assert.rejects(() => ki.pressKey('a', '100'), /duration must be a non-negative number/);
    await assert.rejects(() => ki.pressKey('a', NaN), /duration must be a non-negative number/);
    assert.throws(() => Kimetra({ interval: -1 }), /interval must be a non-negative number/);

    await assert.rejects(
        () => ki.executeSequence([{ type: 'wait', duration: 3e9 }]),
        /wait duration of 3000000000 exceeds the maximum of 2147483647 microseconds/
    );

    const ms = Kimetra({ unit: 'millisecond' });
    await assert.rejects(() => ms.sleep(3e6), /exceeds the maximum of 2147483 milliseconds/);
});

test('wait and sleep require a duration', async () => {
    const ki = Kimetra();
    await assert.rejects(
        () => ki.executeSequence([{ type: 'wait' }]),
        /A "wait" action needs a duration/
    );
    await assert.rejects(() => ki.sleep(), /sleep needs a duration/);
});

// Batch compilation

test('pressKey compiles to down, hold, up', async () => {
    const ki = Kimetra();
    const taken = capture(ki);
    await ki.pressKey('a');
    assert.deepStrictEqual(taken().ops, [
        [OP_DOWN, Key.a],
        [OP_SLEEP, 700],
        [OP_UP, Key.a]
    ]);
});

test('pressHotkey releases in reverse order, a gap apart, with no trailing gap', async () => {
    const ki = Kimetra();
    const taken = capture(ki);
    await ki.pressHotkey(['ctrl', 'shift', 'a']);

    assert.deepStrictEqual(taken().ops, [
        [OP_DOWN, Key.ctrl], [OP_SLEEP, 1000],
        [OP_DOWN, Key.shift], [OP_SLEEP, 1000],
        [OP_DOWN, Key.a], [OP_SLEEP, 2500],
        [OP_UP, Key.a], [OP_SLEEP, 1000],
        [OP_UP, Key.shift], [OP_SLEEP, 1000],
        [OP_UP, Key.ctrl]
    ]);
});

test('keyDown and keyUp compile to a single event, also inside a sequence', async () => {
    const ki = Kimetra({ delay: 500 });
    const taken = capture(ki);

    await ki.keyDown('shift');
    assert.deepStrictEqual(taken().ops, [[OP_SLEEP, 500], [OP_DOWN, Key.shift]]);

    await ki.executeSequence([
        { type: 'down', key: 'shift', delay: 0 },
        { type: 'key', key: 'a', duration: 0, delay: 0 },
        { type: 'up', key: 'shift', delay: 0 }
    ]);
    assert.deepStrictEqual(taken().ops, [
        [OP_DOWN, Key.shift], [OP_DOWN, Key.a], [OP_UP, Key.a], [OP_UP, Key.shift]
    ]);
});

test('pressKeys applies the interval between keys, not the delay', async () => {
    const ki = Kimetra();
    const taken = capture(ki);
    await ki.pressKeys(['a', 'b'], 5000);

    const sleeps = taken().ops.filter(o => o[0] === OP_SLEEP).map(o => o[1]);
    assert.ok(sleeps.includes(5000), `expected a 5000us interval, got ${sleeps}`);
});

test('repeatKey emits one press per repetition in a single batch', async () => {
    const ki = Kimetra();
    const taken = capture(ki);
    await ki.repeatKey('down', 4);

    const downs = taken().ops.filter(o => o[0] === OP_DOWN);
    assert.strictEqual(downs.length, 4);
});

test('typeText passes the string through the batch', async () => {
    const ki = Kimetra();
    const taken = capture(ki);
    await ki.typeText('hello');

    const result = taken();
    assert.deepStrictEqual(result.ops, [[OP_TEXT, 0]]);
    assert.deepStrictEqual(result.texts, ['hello']);
});

// Sequences

test('a wait action honours its duration', async () => {
    const ki = Kimetra();
    const taken = capture(ki);
    await ki.executeSequence([{ type: 'wait', duration: 500000 }]);
    assert.deepStrictEqual(taken().ops, [[OP_SLEEP, 500000]]);
});

test('a whole sequence compiles into one batch', async () => {
    const ki = Kimetra();
    const taken = capture(ki);
    await ki.executeSequence([
        { type: 'hotkey', keys: ['ctrl', 'a'] },
        { type: 'wait', duration: 1000 },
        { type: 'text', text: 'hi' },
        { type: 'key', key: 'enter' }
    ]);

    const result = taken();
    assert.ok(result.ops.length > 6);
    assert.deepStrictEqual(result.texts, ['hi']);
    assert.deepStrictEqual(result.ops[result.ops.length - 1], [OP_UP, Key.enter]);
});

test('a failed batch leaves nothing behind for the next call', async () => {
    const ki = Kimetra({ delay: 500 });
    const taken = capture(ki);

    await assert.rejects(() => ki.keyDown('entre'), /Unknown key "entre"/);
    await assert.rejects(() => ki.executeSequence([{ type: 'nope' }]), /Unknown action type "nope"/);
    await assert.rejects(
        () => ki.executeSequence([{ type: 'text', text: 'x' }, { type: 'key', key: 'entre' }]),
        /Unknown key "entre"/
    );
    assert.strictEqual(ki._len, 0);
    assert.strictEqual(ki._texts.length, 0);

    await ki.keyDown('a');
    assert.deepStrictEqual(taken().ops, [[OP_SLEEP, 500], [OP_DOWN, Key.a]]);
});

// Shortcuts

test('editing shortcuts use the right modifier for this platform', async () => {
    const ki = Kimetra();
    const taken = capture(ki);
    await ki.copy();

    const downs = taken().ops.filter(o => o[0] === OP_DOWN).map(o => o[1]);
    const expected = process.platform === 'darwin' ? Key.meta : Key.ctrl;
    assert.deepStrictEqual(downs, [expected, Key.c]);
});

test('redo uses the chord each platform expects', async () => {
    const ki = Kimetra();
    const taken = capture(ki);
    await ki.redo();

    const downs = taken().ops.filter(o => o[0] === OP_DOWN).map(o => o[1]);
    const expected = process.platform === 'win32'
        ? [Key.ctrl, Key.y]
        : process.platform === 'darwin'
            ? [Key.meta, Key.shift, Key.z]
            : [Key.ctrl, Key.shift, Key.z];

    assert.deepStrictEqual(downs, expected);
});

// Mouse

test('mouse actions compile to their own ops', async () => {
    const ki = Kimetra();
    const taken = capture(ki);
    await ki.executeSequence([
        ...(LINUX ? [] : [{ type: 'move', x: 10.4, y: -20 }]),
        { type: 'moveby', x: 3, y: -4 },
        { type: 'mousedown', button: 'right' },
        { type: 'mouseup', button: 'right' },
        { type: 'scroll', y: 2, x: -1 },
        { type: 'scroll', y: -1 }
    ]);

    assert.deepStrictEqual(taken().records, [
        ...(LINUX ? [] : [[OP_MOVE, 10, -20]]),
        [OP_MOVE_BY, 3, -4],
        [OP_BUTTON_DOWN, 1, 1],
        [OP_BUTTON_UP, 1, 1],
        [OP_SCROLL, 2, -1],
        [OP_SCROLL, -1, 0]
    ]);
});

test('click holds each press for duration and numbers the presses of a multi-click', async () => {
    const ki = Kimetra();
    const taken = capture(ki);

    await ki.click();
    assert.deepStrictEqual(taken().records, [
        [OP_BUTTON_DOWN, 0, 1], [OP_SLEEP, 700, 0], [OP_BUTTON_UP, 0, 1]
    ]);

    await ki.click('back', 2);
    assert.deepStrictEqual(taken().records, [
        [OP_BUTTON_DOWN, 3, 1], [OP_SLEEP, 700, 0], [OP_BUTTON_UP, 3, 1],
        [OP_SLEEP, 700, 0],
        [OP_BUTTON_DOWN, 3, 2], [OP_SLEEP, 700, 0], [OP_BUTTON_UP, 3, 2]
    ]);
});

test('a relative glide covers the exact distance in the exact time', async () => {
    const ki = Kimetra({ unit: 'millisecond' });
    const taken = capture(ki);
    await ki.moveMouseBy(101, -37, 100);

    const { records } = taken();
    const moves = records.filter(r => r[0] === OP_MOVE_BY);
    assert.strictEqual(moves.reduce((total, r) => total + r[1], 0), 101);
    assert.strictEqual(moves.reduce((total, r) => total + r[2], 0), -37);
    assert.strictEqual(sum(records, OP_SLEEP), 100000);
    assert.strictEqual(moves.length, 25, 'a point every 4 ms');
});

test('an absolute glide starts at the pointer and ends exactly on the target', async () => {
    if (LINUX) return;
    const ki = Kimetra({ unit: 'millisecond' });
    const taken = capture(ki);
    ki.mousePosition = () => ({ x: 0, y: 0 });
    await ki.moveMouse(400, 100, 40);

    const { records } = taken();
    const moves = records.filter(r => r[0] === OP_MOVE);
    assert.strictEqual(moves.length, 10);
    assert.deepStrictEqual(moves[0], [OP_MOVE, 40, 10]);
    assert.deepStrictEqual(moves[9], [OP_MOVE, 400, 100]);
    assert.strictEqual(sum(records, OP_SLEEP), 40000);
});

test('a glide inside a batch starts where the earlier moves leave the pointer', async () => {
    if (LINUX) return;
    const ki = Kimetra();
    const taken = capture(ki);
    let reads = 0;
    ki.mousePosition = () => { reads++; return { x: 0, y: 0 }; };

    // Known from the absolute move: no position read.
    await ki.executeSequence([
        { type: 'move', x: 100, y: 100 },
        { type: 'moveby', x: 10, y: 0 },
        { type: 'move', x: 210, y: 100, duration: 8000 }
    ]);
    assert.deepStrictEqual(taken().records.filter(r => r[0] === OP_MOVE).slice(1), [
        [OP_MOVE, 160, 100], [OP_MOVE, 210, 100]
    ]);
    assert.strictEqual(reads, 0);

    // Unknown: read once, then shifted by the relative move compiled before the glide.
    await ki.executeSequence([
        { type: 'moveby', x: 10, y: 0 },
        { type: 'move', x: 110, y: 0, duration: 8000 }
    ]);
    assert.deepStrictEqual(taken().records.filter(r => r[0] === OP_MOVE), [
        [OP_MOVE, 60, 0], [OP_MOVE, 110, 0]
    ]);
    assert.strictEqual(reads, 1);
});

test('Linux reports that absolute moves and position reads are not available yet', async () => {
    const ki = Kimetra();
    capture(ki);
    if (LINUX) {
        await assert.rejects(() => ki.moveMouse(1, 1), /not available on Linux yet/);
        assert.throws(() => ki.mousePosition(), /not available on Linux yet/);
    } else {
        await ki.moveMouse(1, 1);
    }
});

test('mouse arguments are validated', async () => {
    const ki = Kimetra();
    await assert.rejects(() => ki.click('side'), /Unknown mouse button "side"/);
    await assert.rejects(() => ki.mouseDown('constructor'), /Unknown mouse button/);
    await assert.rejects(() => ki.click('left', 1.5), /click needs a whole number of times/);
    await assert.rejects(() => ki.moveMouseBy(NaN, 0), /x must be a finite number/);
    await assert.rejects(() => ki.moveMouseBy(0, '5'), /y must be a finite number/);
    await assert.rejects(() => ki.moveMouseBy(1, 1, -5), /duration must be a non-negative number/);
    await assert.rejects(() => ki.scroll(), /y must be a finite number, received undefined/);
});

// Macros

test('Kimacro has every action method and records what Kimetra would run', async () => {
    const calls = {
        keyDown: ['shift', 1], keyUp: ['shift', 2], pressKey: ['a', 3, 4],
        pressKeys: [['a', 'b'], 5, 6], pressHotkey: [['ctrl', 'a'], 7, 8],
        repeatKey: ['a', 2, 9, 10], typeText: ['hi', 11], moveMouse: [1, 2, 3, 4],
        moveMouseBy: [5, 6, 7, 8], click: ['right', 2, 9], mouseDown: ['middle', 10],
        mouseUp: ['middle', 11], scroll: [-3, 1, 12]
    };
    const ki = Kimetra();
    let ran = null;
    ki.executeSequence = async actions => { ran = actions[0]; return true; };

    for (const [method, args] of Object.entries(calls)) {
        await ki[method](...args);
        assert.deepStrictEqual(Kimacro()[method](...args).toJSON(), [ran], method);
    }
});

test('a macro is replayable and survives exec', async () => {
    const macro = Kimacro().pressKey('enter').typeText('hi').wait(1000);
    capture(macro.ki);

    assert.strictEqual(macro.sequence.length, 3);
    await macro.exec();
    assert.strictEqual(macro.sequence.length, 3, 'exec must not clear the sequence');
    await macro.exec();
    assert.strictEqual(macro.sequence.length, 3);
});

test('add stores a copy of the action it is given', () => {
    const action = { type: 'key', key: 'a', duration: undefined };
    const macro = Kimacro().add(action);

    assert.ok('duration' in action, 'the caller\'s object must not be modified');

    action.key = 'b';
    assert.strictEqual(macro.toJSON()[0].key, 'a');
});

test('a macro round-trips through JSON', () => {
    const original = Kimacro().pressHotkey(['ctrl', 's']).wait(500);
    const restored = Kimacro().fromJSON(JSON.parse(JSON.stringify(original.toJSON())));
    assert.deepStrictEqual(restored.toJSON(), original.toJSON());
});

test('fromJSON rejects anything that is not an array', () => {
    assert.throws(() => Kimacro().fromJSON({ nope: true }), /expects an array/);
});

// Native surface

test('the addon matches this version and exposes the full core surface', () => {
    const ki = Kimetra();
    assert.strictEqual(ki.core.Format, 3, 'src/bin holds a binary built for older JS; rebuild or sync it');
    for (const name of ['KeyDown', 'KeyUp', 'SendString', 'Sleep', 'Run', 'MousePosition', 'Cleanup']) {
        assert.strictEqual(typeof ki.core[name], 'function', `core.${name} is missing`);
    }
});

test('cleanup is callable more than once', () => {
    const ki = Kimetra();
    ki.cleanup();
    ki.cleanup();
});

test('sleep does not busy-wait, including after cleanup', () => {
    const ki = Kimetra();

    // Fraction of a core used while sleeping; a full busy-wait reports ~1.0.
    const coreUsage = () => {
        const cpuStart = process.cpuUsage();
        const wallStart = process.hrtime.bigint();
        ki.core.Sleep(100000);
        const wall = Number(process.hrtime.bigint() - wallStart) / 1000;
        const cpu = process.cpuUsage(cpuStart);
        return (cpu.user + cpu.system) / wall;
    };

    const before = coreUsage();
    ki.cleanup();
    const after = coreUsage();

    assert.ok(before < 0.5, `sleep burned ${(before * 100).toFixed(0)}% of a core`);
    assert.ok(after < 0.5, `sleep burned ${(after * 100).toFixed(0)}% of a core after cleanup()`);
});

test('sleep never returns early and reads the right unit', () => {
    const ki = Kimetra();
    const measured = [];

    for (const micros of [1000, 20000, 50000]) {
        const start = process.hrtime.bigint();
        ki.core.Sleep(micros);
        const elapsed = Number(process.hrtime.bigint() - start) / 1000;
        measured.push(`${micros}us -> ${elapsed.toFixed(0)}us`);

        // A sleep must never finish early.
        assert.ok(
            elapsed >= micros * 0.98,
            `Sleep(${micros}) returned after ${elapsed.toFixed(0)}us, which is early`
        );
        
        assert.ok(
            elapsed < micros + 500000,
            `Sleep(${micros}) took ${elapsed.toFixed(0)}us, far beyond the request`
        );
    }

    console.log(`        timing: ${measured.join(', ')}`);
});

// CLI
// Driven through --dry-run, so no key events are sent.

const CLI = path.resolve(__dirname, '../bin/cli.js');

function cli(args) {
    try {
        const out = execFileSync(process.execPath, [CLI, ...args], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
        });
        return { code: 0, out };
    } catch (err) {
        return { code: err.status, out: (err.stdout || '') + (err.stderr || '') };
    }
}

test('no command word is also a key name', () => {
    // `keys` reads until the next command word, so no command may be a key name.
    const words = [
        'key', 'keys', 'hotkey', 'repeat', 'type',
        'move', 'moveby', 'click', 'mousedown', 'mouseup', 'scroll',
        'wait', 'run', 'list'
    ];
    for (const word of words) {
        assert.strictEqual(Key[word], undefined, `"${word}" is both a command and a key name`);
    }
});

test('mouse commands compile to mouse actions, scaling only times', () => {
    const { code, out } = cli([
        '--dry-run', 'mousedown', 'move', '600', '400', '300', 'mouseup',
        'click', 'right', '2', 'scroll', '-3', '1', 'moveby', '5', '-5'
    ]);
    assert.strictEqual(code, 0);
    assert.deepStrictEqual(JSON.parse(out), [
        { type: 'mousedown' },
        { type: 'move', x: 600, y: 400, duration: 300000 },
        { type: 'mouseup' },
        { type: 'click', button: 'right', count: 2 },
        { type: 'scroll', y: -3, x: 1 },
        { type: 'moveby', x: 5, y: -5 }
    ]);
});

test('a chain compiles into one action list', () => {
    const { code, out } = cli(['--dry-run', 'hotkey', 'alt+tab', 'wait', '200', 'type', 'hi', 'key', 'enter']);
    assert.strictEqual(code, 0);
    assert.deepStrictEqual(JSON.parse(out), [
        { type: 'hotkey', keys: ['alt', 'tab'] },
        { type: 'wait', duration: 200000 },
        { type: 'text', text: 'hi' },
        { type: 'key', key: 'enter' }
    ]);
});

test('a variadic keys command stops at the next command', () => {
    const { out } = cli(['--dry-run', 'keys', 'a', 'up', 'b', 'wait', '5']);
    assert.deepStrictEqual(JSON.parse(out), [
        { type: 'keys', keys: ['a', 'up', 'b'] },
        { type: 'wait', duration: 5000 }
    ]);
});

test('CLI numbers reach the action list as microseconds', () => {
    assert.strictEqual(JSON.parse(cli(['--dry-run', 'wait', '500']).out)[0].duration, 500000);
    assert.strictEqual(JSON.parse(cli(['--dry-run', 'wait', '500', '-u', 'us']).out)[0].duration, 500);
});

test('what the CLI emits is what the library accepts', async () => {
    const { out } = cli([
        '--dry-run', 'keys', 'a', 'b', 'wait', '5', 'repeat', 'down', '3',
        'click', 'middle', 'moveby', '2', '-2', '10', 'scroll', '1'
    ]);
    const ki = Kimetra();
    const taken = capture(ki);

    await ki.executeSequence(JSON.parse(out));
    assert.ok(taken().ops.length > 0);
});

test('a macro saved by Kimacro loads in the CLI unchanged', () => {
    const file = path.join(os.tmpdir(), 'kimetra-cli-test.json');
    const saved = Kimacro().pressKey('enter').typeText('hi').wait(1000000).toJSON();
    fs.writeFileSync(file, JSON.stringify(saved));

    try {
        const { code, out } = cli(['--dry-run', 'run', file]);
        assert.strictEqual(code, 0);
        assert.deepStrictEqual(JSON.parse(out), saved);
    } finally {
        fs.unlinkSync(file);
    }
});

test('usage mistakes exit 2, runtime failures exit 1', () => {
    for (const args of [['nope'], ['key'], ['hotkey', 'ctrl'], ['--unit', 'seconds'], ['wait', '-5']]) {
        assert.strictEqual(cli(args).code, 2, `expected exit 2 for: ${args.join(' ')}`);
    }
    assert.strictEqual(cli(['key', 'entre']).code, 1, 'an unknown key is a runtime failure');
});

test('help and version do not need the native addon', () => {
    for (const flag of ['--help', '--version']) {
        const { code, out } = cli([flag]);
        assert.strictEqual(code, 0);
        assert.ok(out.trim().length > 0, `${flag} printed nothing`);
    }
});

(async () => {
    let failed = 0;

    for (const { name, fn } of tests) {
        try {
            await fn();
            console.log(`  ok    ${name}`);
        } catch (err) {
            failed++;
            console.error(`  FAIL  ${name}\n        ${err.message}`);
        }
    }

    console.log(`\n${tests.length - failed}/${tests.length} passed`);
    process.exit(failed ? 1 : 0);
})();
