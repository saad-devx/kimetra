/**
 * Kimetra test suite.
 *
 * No test sends a real key event. Batches are compiled and inspected instead, so
 * the suite is safe to run on a desktop and on a headless CI machine.
 */

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const { Kimetra, Kimacro, Key } = require('../index.cjs');

const OP_DOWN = 0;
const OP_UP = 1;
const OP_SLEEP = 2;
const OP_TEXT = 3;

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

/** Replaces the native call with a capture, so nothing reaches the OS. */
function capture(ki) {
    let ops = null;
    let texts = null;

    ki._run = function () {
        ops = [];
        for (let i = 0; i < this._len; i += 2) {
            ops.push([this._ops[i], this._ops[i + 1]]);
        }
        texts = this._texts.slice();
        this._len = 0;
        this._texts.length = 0;
        return true;
    };

    return () => ({ ops, texts });
}

// ==================================================
// Entry points
// ==================================================

test('CJS entry exports exactly Kimetra, Kimacro and Key', () => {
    const api = require('../index.cjs');
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

// ==================================================
// Key map
// ==================================================

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

// ==================================================
// Options
// ==================================================

test('defaults are microseconds', () => {
    const ki = Kimetra();
    assert.strictEqual(ki.unit, 'microsecond');
    assert.strictEqual(ki.delay, 0);
    assert.strictEqual(ki.interval, 700);
    assert.strictEqual(ki.duration, 700);
    assert.strictEqual(ki.hotkeyDelay, 1500);
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

// ==================================================
// Key resolution
// ==================================================

test('an unknown key name throws a useful error', async () => {
    const ki = Kimetra();
    await assert.rejects(() => ki.pressKey('entre'), /Unknown key "entre"/);
});

test('a raw code from Key passes through', async () => {
    const ki = Kimetra();
    const taken = capture(ki);
    await ki.pressKey(Key.enter);
    assert.strictEqual(taken().ops[0][1], Key.enter);
});

// ==================================================
// Batch compilation
// ==================================================

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

test('pressHotkey releases in reverse order', async () => {
    const ki = Kimetra();
    const taken = capture(ki);
    await ki.pressHotkey(['ctrl', 'shift', 'a']);

    const ops = taken().ops;
    const downs = ops.filter(o => o[0] === OP_DOWN).map(o => o[1]);
    const ups = ops.filter(o => o[0] === OP_UP).map(o => o[1]);

    assert.deepStrictEqual(downs, [Key.ctrl, Key.shift, Key.a]);
    assert.deepStrictEqual(ups, [Key.a, Key.shift, Key.ctrl]);
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

// ==================================================
// Sequences
// ==================================================

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

test('an unknown action type throws and leaves no partial batch', async () => {
    const ki = Kimetra();
    await assert.rejects(() => ki.executeSequence([{ type: 'nope' }]), /Unknown action type "nope"/);
    assert.strictEqual(ki._len, 0);
});

test('a bad key mid-sequence discards the partial batch', async () => {
    const ki = Kimetra();
    const taken = capture(ki);

    await assert.rejects(
        () => ki.executeSequence([{ type: 'key', key: 'enter' }, { type: 'key', key: 'entre' }]),
        /Unknown key "entre"/
    );
    assert.strictEqual(ki._len, 0);
    assert.strictEqual(ki._texts.length, 0);

    // The next call must not replay anything left over from the failed one.
    await ki.pressKey('a');
    assert.deepStrictEqual(taken().ops, [
        [OP_DOWN, Key.a],
        [OP_SLEEP, 700],
        [OP_UP, Key.a]
    ]);
});

// ==================================================
// Shortcuts
// ==================================================

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

// ==================================================
// Macros
// ==================================================

test('a macro is replayable and survives exec', async () => {
    const macro = Kimacro().pressKey('enter').typeText('hi').wait(1000);
    capture(macro.ki);

    assert.strictEqual(macro.sequence.length, 3);
    await macro.exec();
    assert.strictEqual(macro.sequence.length, 3, 'exec must not clear the sequence');
    await macro.exec();
    assert.strictEqual(macro.sequence.length, 3);
});

test('a macro round-trips through JSON', () => {
    const original = Kimacro().pressHotkey(['ctrl', 's']).wait(500);
    const restored = Kimacro().fromJSON(JSON.parse(JSON.stringify(original.toJSON())));
    assert.deepStrictEqual(restored.toJSON(), original.toJSON());
});

test('fromJSON rejects anything that is not an array', () => {
    assert.throws(() => Kimacro().fromJSON({ nope: true }), /expects an array/);
});

// ==================================================
// Native surface
// ==================================================

test('the addon exposes the full core surface', () => {
    const ki = Kimetra();
    for (const name of ['KeyDown', 'KeyUp', 'SendString', 'Sleep', 'Run', 'Cleanup']) {
        assert.strictEqual(typeof ki.core[name], 'function', `core.${name} is missing`);
    }
});

test('cleanup is callable more than once', () => {
    const ki = Kimetra();
    ki.cleanup();
    ki.cleanup();
});

test('sleep never returns early and reads the right unit', () => {
    const ki = Kimetra();
    const measured = [];

    for (const micros of [1000, 20000, 50000]) {
        const start = process.hrtime.bigint();
        ki.core.Sleep(micros);
        const elapsed = Number(process.hrtime.bigint() - start) / 1000;
        measured.push(`${micros}us -> ${elapsed.toFixed(0)}us`);

        // The guarantee worth testing: a sleep never finishes early.
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

// ==================================================

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
