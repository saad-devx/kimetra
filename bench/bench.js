#!/usr/bin/env node
'use strict';

/**
 * Kimetra benchmarks. Run from the repository root:
 *
 *   npm run bench                 measurements that send no input
 *   npm run bench -- --input      also sends real keyboard and mouse input
 *   npm run bench -- --markdown   prints the results as Markdown tables
 *   npm run bench -- --runs 5     repeats each input measurement 5 times (default 3)
 *
 * Other libraries are measured too when installed:
 *   npm install --no-save robotjs @nut-tree-fork/nut-js
 */

const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { load, toActions } = require('./drivers');
const { script, planned, contents } = require('./script');

const ROOT = path.resolve(__dirname, '..');
const OTHERS = ['robotjs', '@nut-tree-fork/nut-js', '@nut-tree/nut-js'];

const args = process.argv.slice(2);
const INPUT = args.includes('--input');
const MARKDOWN = args.includes('--markdown');
const RUNS = Math.max(1, Number(args[args.indexOf('--runs') + 1]) || 3);
const OF_RUNS = RUNS === 1 ? 'one run' : `median of ${RUNS} runs`;

const KEY_TAPS = 500;
const POINTER_MOVES = 500;
const TYPED = 'The quick brown fox jumps over the lazy dog. '.repeat(7).slice(0, 300);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const now = () => Number(process.hrtime.bigint()) / 1e6;
const sorted = values => values.slice().sort((a, b) => a - b);
const median = values => sorted(values)[values.length >> 1];
const percentile = (values, p) => sorted(values)[Math.min(values.length - 1, Math.floor(p * values.length))];

const ms = value => (value === null ? '-' : value < 10 ? value.toFixed(2) : value.toFixed(1));
const ns = value => (value < 1000 ? `${value.toFixed(0)} ns` : `${(value / 1000).toFixed(2)} µs`);
const rate = (count, elapsedMs) => Math.round(count / (elapsedMs / 1000)).toLocaleString('en-US');

function version(name) {
    try {
        return require(require.resolve(`${name}/package.json`, { paths: [ROOT] })).version;
    } catch {
        return null;
    }
}

function print(title, columns, rows, note) {
    if (MARKDOWN) {
        console.log(`\n### ${title}\n`);
        console.log(`| ${columns.join(' | ')} |`);
        console.log(`| ${columns.map(() => '---').join(' | ')} |`);
        for (const row of rows) console.log(`| ${row.join(' | ')} |`);
        if (note) console.log(`\n${note}`);
        return;
    }

    const widths = columns.map((c, i) => Math.max(c.length, ...rows.map(r => String(r[i]).length)));
    const line = cells => '  ' + cells.map((c, i) => String(c).padEnd(widths[i])).join('   ');
    console.log(`\n${title}\n`);
    if (columns.some(Boolean)) {
        console.log(line(columns));
        console.log('  ' + widths.map(w => '-'.repeat(w)).join('   '));
    }
    for (const row of rows) console.log(line(row));
    if (note) console.log(`\n  ${note.replace(/\n/g, '\n  ')}`);
}

function environment() {
    const installed = OTHERS.filter(version).map(name => `${name} ${version(name)}`);
    print('Environment', ['', ''], [
        ['OS', `${os.type()} ${os.release()} (${process.platform}-${process.arch})`],
        ['CPU', os.cpus()[0].model.trim()],
        ['Node', process.version],
        ['Kimetra', require(path.join(ROOT, 'package.json')).version],
        ['Also measured', installed.length ? installed.join(', ') : 'none installed']
    ]);
}

/** require() time, measured inside 15 fresh processes. */
function loadTimes() {
    const probe = request =>
        `const t = process.hrtime.bigint(); require(${JSON.stringify(request)}); ` +
        'console.log(Number(process.hrtime.bigint() - t) / 1e6)';

    const rows = [];
    for (const [name, request] of [['kimetra', ROOT], ...OTHERS.filter(version).map(n => [n, n])]) {
        try {
            const samples = [];
            for (let i = 0; i < 15; i++) {
                const out = execFileSync(process.execPath, ['-e', probe(request)], {
                    cwd: ROOT,
                    encoding: 'utf8',
                    stdio: ['ignore', 'pipe', 'ignore']
                });
                samples.push(Number(out));
            }
            rows.push([name, ms(median(samples))]);
        } catch {
            rows.push([name, 'failed to load']);
        }
    }
    print('Load time: require(), median of 15 fresh processes', ['Library', 'ms'], rows);
}

/** Time from a method call until native code has the batch, with nothing sent. */
async function callCost() {
    const { Kimetra } = require(ROOT);
    const ki = Kimetra();

    let native = true;
    try {
        ki.core.Run(new Int32Array(3), 0, []);
    } catch {
        native = false; // no input permission: measure the JavaScript side alone
    }
    ki._run = function () {
        this._len = 0;
        if (native) ki.core.Run(this._ops, 0, this._texts);
        this._texts.length = 0;
        return true;
    };

    const text = 'x'.repeat(50);
    const editing = toActions(script(process.platform), null);
    const cases = [
        ['pressKey', () => ki.pressKey('a'), 50000],
        ['pressHotkey, 2 keys', () => ki.pressHotkey(['ctrl', 'c']), 50000],
        ['typeText, 50 characters', () => ki.typeText(text), 50000],
        ['click', () => ki.click(), 50000],
        ['moveMouseBy, 100 ms glide (25 points)', () => ki.moveMouseBy(100, 50, 100000), 20000],
        [`executeSequence, the editing script (${editing.length} actions)`, () => ki.executeSequence(editing), 2000]
    ];

    const rows = [];
    for (const [label, call, count] of cases) {
        for (let i = 0; i < Math.min(count, 2000); i++) await call();
        const start = now();
        for (let i = 0; i < count; i++) await call();
        rows.push([label, ns(((now() - start) * 1e6) / count)]);
    }

    print(
        'Call cost: from the method call until native code has the batch (no input sent)',
        ['Call', 'Time per call'],
        rows,
        native ? null : 'Input permission is missing, so this measures the JavaScript side only.'
    );
}

/** How far a requested wait overshoots: Kimetra's native wait against setTimeout. */
async function waitAccuracy() {
    const core = require(ROOT).Kimetra().core;
    const rows = [];

    for (const target of [1, 5, 16]) {
        const count = target === 16 ? 60 : 200;
        const native = [];
        const timer = [];

        for (let i = 0; i < count; i++) {
            const start = now();
            core.Sleep(target * 1000);
            native.push(now() - start - target);
        }
        for (let i = 0; i < count; i++) {
            const start = now();
            await sleep(target);
            timer.push(now() - start - target);
        }

        for (const [name, errors] of [['kimetra native wait', native], ['setTimeout', timer]]) {
            rows.push([`${target} ms`, name, ms(median(errors)), ms(percentile(errors, 0.99)), ms(Math.max(...errors))]);
        }
    }

    print(
        'Wait accuracy: time past the requested wait, in ms',
        ['Wait', 'Method', 'Median', 'p99', 'Worst'],
        rows,
        'Other libraries wait between actions with setTimeout.'
    );
}

async function countdown() {
    const seconds = process.platform === 'linux' ? 8 : 6;
    console.log(`
This part sends real keyboard and mouse input for about a minute.

  1. Open an empty text editor (Notepad, TextEdit, gedit) and maximise it.
  2. Click inside it and leave the pointer over the middle of the window.
  3. Do not touch the keyboard or mouse until it finishes. Ctrl+C aborts.
`);
    for (let s = seconds; s > 0; s--) {
        process.stdout.write(`  Starting in ${s}...\r`);
        await sleep(1000);
    }
    process.stdout.write('                      \r');
}

async function input() {
    const { Kimetra } = require(ROOT);
    const ki = Kimetra({ unit: 'millisecond' });

    if (ki.core.Format !== 3) {
        console.log('\nInput measurements skipped: src/bin holds a binary built for older code. Sync or rebuild it first.');
        return;
    }

    await countdown();

    const start = process.platform === 'linux' ? null : ki.mousePosition();
    const home = async () => {
        if (start) await ki.moveMouse(start.x, start.y);
    };
    const clear = async () => {
        await ki.selectAll();
        await ki.pressKey('backspace');
        await sleep(300);
    };
    const drivers = load();

    async function measure(job, after) {
        const times = [];
        let extra = null;
        for (let run = 0; run < RUNS; run++) {
            await home();
            const begin = now();
            const result = await job();
            times.push(now() - begin);
            if (result === 'skipped') return { skipped: true };
            if (result && typeof result === 'object') extra = result;
            if (after) await after();
        }
        return { ms: median(times), extra };
    }

    let rows = [];
    for (const d of drivers.filter(d => d.keyTaps)) {
        const r = await measure(() => d.keyTaps(KEY_TAPS));
        rows.push([d.name, ms(r.ms), rate(KEY_TAPS, r.ms)]);
    }
    print(`Key taps: ${KEY_TAPS} presses and releases of F20, ${OF_RUNS}`, ['Library', 'Total ms', 'Taps per second'], rows);

    rows = [];
    for (const d of drivers.filter(d => d.pointerMoves)) {
        const r = await measure(() => d.pointerMoves(POINTER_MOVES, start));
        rows.push(r.skipped ? [d.name, '-', 'needs the pointer position'] : [d.name, ms(r.ms), rate(POINTER_MOVES, r.ms)]);
    }
    print(`Pointer moves: ${POINTER_MOVES} one-pixel moves, ${OF_RUNS}`, ['Library', 'Total ms', 'Moves per second'], rows,
        start ? null : 'Kimetra uses relative moves here, because Linux does not expose the pointer position.');

    rows = [];
    for (const d of drivers.filter(d => d.type)) {
        const r = await measure(() => d.type(TYPED), clear);
        rows.push([d.name, ms(r.ms), rate(TYPED.length, r.ms)]);
    }
    print(`Typing: ${TYPED.length} characters into the editor, ${OF_RUNS}`, ['Library', 'Total ms', 'Characters per second'], rows,
        'Kimetra types a whole string in one call either way, so it appears once.');

    const steps = script(process.platform);
    const plan = planned(steps);
    const has = contents(steps);
    rows = [];
    for (const d of drivers) {
        const r = await measure(() => d.script(steps, start), clear);
        const library = r.extra && r.extra.holdsMs !== undefined ? r.extra.holdsMs : null;
        rows.push([d.name, ms(r.ms), ms(plan), ms(r.ms - plan), ms(library)]);
    }
    print(
        `Editing script: ${has.steps} steps, ${OF_RUNS}`,
        ['Library', 'Total ms', 'Waits in the script', 'Added on top', 'Of which deliberate holds and gaps'],
        rows,
        `The script types ${has.characters} characters, taps ${has.keys} keys, presses ${has.hotkeys} shortcuts,\n` +
        `draws ${has.glides} pointer glides, scrolls ${has.scrolls} times and clicks ${has.clicks} times.\n` +
        '"Added on top" is everything beyond the script\'s own waits. For Kimetra, part of it is the\n' +
        'key holds and modifier gaps it adds on purpose so apps register every key.'
    );

    await home();
}

(async () => {
    if (MARKDOWN) console.log('## Benchmarks');
    environment();
    loadTimes();
    await callCost();
    await waitAccuracy();
    if (INPUT) await input();
    else console.log('\nRun with --input to also measure real keyboard and mouse input.');
})().catch(err => {
    console.error(`\nBenchmark failed: ${err.message}`);
    process.exitCode = 1;
});
