#!/usr/bin/env node
'use strict';

/**
 * Kimetra benchmarks. Run from the repository root:
 *
 *   npm run bench                  measurements that send no input
 *   npm run bench -- --input       also runs the scenarios in a browser page, with real input
 *   npm run bench -- --report      everything, written as Markdown to bench/report.md
 *   npm run bench -- --runs 5      runs each scenario 5 times (default 3)
 *   npm run bench -- --only nut    only libraries whose name contains "nut"
 *
 * Other libraries are measured too when installed:
 *   npm install --no-save robotjs @nut-tree-fork/nut-js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { load, toAction } = require('./drivers');
const { scenarios, planned } = require('./scenarios');
const receiver = require('./receiver');

const ROOT = path.resolve(__dirname, '..');
const OTHERS = ['robotjs', '@nut-tree-fork/nut-js', '@nut-tree/nut-js'];
const REPORT_FILE = path.join(__dirname, 'report.md');
const MOD = process.platform === 'darwin' ? 'meta' : 'ctrl';

const args = process.argv.slice(2);
const option = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const REPORT = args.includes('--report');
const INPUT = REPORT || args.includes('--input');
const RUNS = Math.max(1, Number(option('--runs')) || 3);
const ONLY = option('--only');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const now = () => Number(process.hrtime.bigint()) / 1e6;
const sorted = values => values.slice().sort((a, b) => a - b);
const median = values => sorted(values)[values.length >> 1];
const percentile = (values, p) => sorted(values)[Math.min(values.length - 1, Math.floor(p * values.length))];

const ms = value => (value === null || value === undefined ? '-' : Math.abs(value) < 10 ? value.toFixed(2) : value.toFixed(1));
const seconds = value => (value === null || value === undefined ? '-' : (value / 1000).toFixed(2));
const ns = value => (value < 1000 ? `${value.toFixed(0)} ns` : `${(value / 1000).toFixed(2)} µs`);

function version(name) {
    try {
        return require(require.resolve(`${name}/package.json`, { paths: [ROOT] })).version;
    } catch {
        return null;
    }
}

// ==================================================
// Output
// ==================================================

const sections = { environment: [], summary: [], scenarios: [], quiet: [] };

function print(group, title, columns, rows, note) {
    const widths = columns.map((c, i) => Math.max(c.length, ...rows.map(r => String(r[i]).length)));
    const line = cells => '  ' + cells.map((c, i) => String(c).padEnd(widths[i])).join('   ');
    console.log(`\n${title}\n`);
    if (columns.some(Boolean)) {
        console.log(line(columns));
        console.log('  ' + widths.map(w => '-'.repeat(w)).join('   '));
    }
    for (const row of rows) console.log(line(row));
    if (note) console.log(`\n  ${note.replace(/\n/g, '\n  ')}`);

    const md = [`### ${title}`, '', `| ${columns.join(' | ')} |`, `| ${columns.map(() => '---').join(' | ')} |`];
    for (const row of rows) md.push(`| ${row.join(' | ')} |`);
    if (note) md.push('', note);
    sections[group].push(md.join('\n'));
}

function writeReport() {
    const parts = [
        '# Kimetra benchmark report',
        '',
        `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. ` +
        'How it is measured: [bench/README.md](README.md).',
        '',
        '## Environment',
        '',
        ...sections.environment,
        ...(sections.summary.length || sections.scenarios.length
            ? ['', '## With real input', '', ...[...sections.summary, ...sections.scenarios].flatMap(s => [s, ''])]
            : []),
        '',
        '## Without input',
        '',
        ...sections.quiet.flatMap(s => [s, ''])
    ];
    fs.writeFileSync(REPORT_FILE, parts.join('\n').replace(/\n{3,}/g, '\n\n'));
    console.log(`\nReport written to ${path.relative(process.cwd(), REPORT_FILE)}`);
}

// ==================================================
// Without input
// ==================================================

function browserName(agent) {
    for (const [name, pattern] of [['Edge', /Edg\/([\d.]+)/], ['Firefox', /Firefox\/([\d.]+)/],
        ['Chrome', /Chrome\/([\d.]+)/], ['Safari', /Version\/([\d.]+).*Safari/]]) {
        const match = pattern.exec(agent);
        if (match) return `${name} ${match[1]}`;
    }
    return agent;
}

function environmentRows(browser) {
    const installed = OTHERS.filter(version).map(name => `${name} ${version(name)}`);
    const rows = [
        ['OS', `${os.type()} ${os.release()} (${process.platform}-${process.arch})`],
        ['CPU', os.cpus()[0].model.trim()],
        ['Node', process.version],
        ['Kimetra', require(path.join(ROOT, 'package.json')).version],
        ['Also measured', installed.length ? installed.join(', ') : 'none installed']
    ];
    if (browser) rows.push(['Browser', browser]);
    return rows;
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
    print('quiet', 'Load time: require(), median of 15 fresh processes', ['Library', 'ms'], rows);
}

/** Time from a method call until native code has the batch, with nothing sent. */
async function callCost() {
    const { Kimetra } = require(ROOT);
    const ki = Kimetra({ unit: 'millisecond' });

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
    const macro = scenarios.find(s => s.id === 'game').build().map(toAction);
    const cases = [
        ['pressKey', () => ki.pressKey('a'), 50000],
        ['pressHotkey, 2 keys', () => ki.pressHotkey(['ctrl', 'c']), 50000],
        ['typeText, 50 characters', () => ki.typeText(text), 50000],
        ['click', () => ki.click(), 50000],
        ['moveMouseBy, 100 ms glide (25 points)', () => ki.moveMouseBy(100, 50, 100), 20000],
        [`executeSequence, the game macro (${macro.length} actions)`, () => ki.executeSequence(macro), 5000]
    ];

    const rows = [];
    for (const [label, call, count] of cases) {
        for (let i = 0; i < Math.min(count, 2000); i++) await call();
        const start = now();
        for (let i = 0; i < count; i++) await call();
        rows.push([label, ns(((now() - start) * 1e6) / count)]);
    }

    print('quiet',
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

    print('quiet',
        'Wait accuracy: time past the requested wait, in ms',
        ['Wait', 'Method', 'Median', 'p99', 'Worst'],
        rows,
        'Other libraries wait between actions with setTimeout.'
    );
}

// ==================================================
// Scenarios, with real input
// ==================================================

/**
 * Maps page coordinates (screen CSS pixels) to a library's own pointer units. The library
 * moves the pointer to two points, the page reports where it saw them, and a third point
 * must then land within 3 units of the fit, with the same scale on both axes. A hand on
 * the mouse fails that check instead of skewing every later move. Up to three attempts.
 */
async function calibrate(page, driver) {
    const seen = async point => {
        await driver.jump(point.x, point.y);
        await sleep(150);
        return page.ask('pointer');
    };

    try {
        for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt) await sleep(1000);
            const status = await page.ask('status');
            const base = await driver.position();

            // Step towards the middle of the page, so every point stays on it.
            const p = status.pointer;
            const signX = p && p.x > status.centre.x ? -1 : 1;
            const signY = p && p.y > status.centre.y ? -1 : 1;
            const [a, b, c] = [[20, 12], [260, 160], [140, 86]].map(([x, y]) => ({ x: base.x + signX * x, y: base.y + signY * y }));

            const ca = await seen(a);
            const cb = await seen(b);
            const cc = await seen(c);
            if (!ca || !cb || !cc || cb.x === ca.x || cb.y === ca.y) continue;

            const kx = (b.x - a.x) / (cb.x - ca.x);
            const ky = (b.y - a.y) / (cb.y - ca.y);
            const map = {
                x: css => Math.round(a.x + (css - ca.x) * kx),
                y: css => Math.round(a.y + (css - ca.y) * ky)
            };
            const square = Math.abs(kx - ky) <= 0.03 * Math.max(Math.abs(kx), Math.abs(ky));
            if (square && Math.abs(map.x(cc.x) - c.x) <= 3 && Math.abs(map.y(cc.y) - c.y) <= 3) return map;
        }
    } catch {
        // A library that cannot read or move the pointer stays uncalibrated.
    }
    return null;
}

/** Waits until the page has focus, is back in full screen if it left it, and has settled. */
async function ready(page) {
    let told = false;
    for (let i = 0; i < 480; i++) {
        const status = await page.ask('status');
        if (!status.paused && !status.settling) return status;
        if (status.paused && !told) {
            console.log('\n  The benchmark page lost focus or left full screen. Click inside it to continue.');
            told = true;
        }
        await sleep(250);
    }
    throw new Error('The benchmark page did not get focus back.');
}

/** Puts the pointer on the page centre and checks the page sees it there. Recalibrates once. */
async function place(page, driver, pointers, centre) {
    for (let attempt = 0; attempt < 2; attempt++) {
        const cal = pointers.get(driver);
        if (!cal) return false;
        await driver.jump(cal.x(centre.x), cal.y(centre.y));
        await sleep(150);
        const seen = await page.ask('pointer');
        if (seen && Math.abs(seen.x - centre.x) <= 2 && Math.abs(seen.y - centre.y) <= 2) return true;
        if (!attempt) pointers.set(driver, await calibrate(page, driver));
    }
    return false;
}

async function runOnce(page, scenario, driver, pointers, label) {
    let layout = null;
    let prepared = null;
    while (!prepared || !prepared.focused) {
        const status = await ready(page);
        layout = scenario.layout ? scenario.layout(status) : null;
        prepared = await page.ask('prepare', { scene: scenario.scene, layout, label });
    }

    // Platforms with pointer moves have an entry per library, null if calibration failed.
    const pointer = Boolean(scenario.pointer) && pointers.has(driver);
    const steps = scenario.build(prepared.targets, { pointer, mod: MOD }, layout);

    if (pointer && !(await place(page, driver, pointers, prepared.targets.centre))) {
        await page.ask('finish');
        return {
            elapsed: null,
            planned: planned(steps),
            correct: false,
            detail: 'not run, the pointer did not land where the page expected it (was the mouse moved?)',
            errors: null
        };
    }

    const cal = pointers.get(driver);
    const own = pointer ? steps.map(s => (s.do === 'move' ? { ...s, x: cal.x(s.x), y: cal.y(s.y) } : s)) : steps;

    let failure = null;
    const start = now();
    try {
        await driver.run(own, { synthetic: scenario.synthetic });
    } catch (err) {
        failure = err.message;
    }
    const elapsed = now() - start;

    await sleep(400); // let the last events reach the page
    const result = await page.ask('finish');
    const verdict = failure
        ? { correct: false, detail: `failed: ${failure}`, errors: null }
        : scenario.check(result, steps, layout);
    return { elapsed, planned: planned(steps), ...verdict };
}

function summarise(runs) {
    const errors = runs.flatMap(r => r.errors || []);
    const ran = runs.filter(r => r.elapsed !== null);
    return {
        correct: runs.filter(r => r.correct).length,
        elapsed: ran.length ? median(ran.map(r => r.elapsed)) : null,
        planned: median(runs.map(r => r.planned)),
        added: ran.length ? median(ran.map(r => r.elapsed - r.planned)) : null,
        gap: errors.length ? median(errors) : null,
        wrong: runs.find(r => !r.correct)
    };
}

function scenarioTables(results) {
    for (const scenario of scenarios) {
        const rows = [];
        const notes = [];
        for (const { driver, runs, skipped } of results.filter(r => r.scenario === scenario)) {
            if (skipped) {
                rows.push([driver.name, 'skipped', ...Array(scenario.synthetic ? 3 : 4).fill('-')]);
                notes.push(`${driver.name}: skipped, ${skipped}.`);
                continue;
            }
            const s = summarise(runs);
            if (s.wrong) notes.push(`${driver.name}: ${s.wrong.detail}.`);
            if (scenario.synthetic) {
                const received = Math.min(...runs.map(r => r.received || 0));
                rows.push([driver.name, `${s.correct}/${runs.length}`, `${received}/500`, ms(s.elapsed),
                    Math.round(500 / (s.elapsed / 1000)).toLocaleString('en-US')]);
            } else {
                rows.push([driver.name, `${s.correct}/${runs.length}`, seconds(s.elapsed), seconds(s.planned), ms(s.added),
                    ms(s.gap)]);
            }
        }

        const columns = scenario.synthetic
            ? ['Library', 'Correct runs', 'Fewest received', 'Total ms', 'Taps per second']
            : ['Library', 'Correct runs', 'Total s', 'Planned s', 'Added ms', 'Timing error ms'];
        const note = [scenario.about, ...notes].join('\n');
        print('scenarios', `${scenario.title}, ${RUNS === 1 ? 'one run' : `median of ${RUNS} runs`}`, columns, rows, note);
    }
}

function summaryTable(results, drivers) {
    const rows = drivers.map(driver => {
        const mine = results.filter(r => r.driver === driver && !r.skipped);
        const realistic = mine.filter(r => !r.scenario.synthetic);
        const runs = mine.flatMap(r => r.runs);
        const errors = realistic.flatMap(r => r.runs.flatMap(run => run.errors || []));
        const added = realistic.reduce((total, r) => total + (summarise(r.runs).added || 0), 0);
        return [
            driver.name,
            `${runs.filter(r => r.correct).length}/${runs.length}`,
            realistic.length ? seconds(added) : '-',
            errors.length ? ms(median(errors)) : '-'
        ];
    });

    print('summary',
        'Summary',
        ['Library', 'Correct runs', 'Added on top s', 'Timing error ms'],
        rows,
        '"Added on top" is time beyond what the realistic scenarios ask for, summed over them.\n' +
        '"Timing error" is the median of how far each gap between two events, as received by the\n' +
        'page, was from the planned gap. Both leave out the synthetic key-tap test.'
    );
}

async function input() {
    const { Kimetra } = require(ROOT);
    if (Kimetra().core.Format !== 3) {
        console.log('\nInput measurements skipped: src/bin holds a binary built for older code. Sync or rebuild it first.');
        return null;
    }

    const drivers = load().filter(d => !ONLY || d.name.includes(ONLY));
    if (!drivers.length) {
        console.log(`\nNo library name contains "${ONLY}".`);
        return null;
    }

    const page = await receiver.start();
    console.log(`\nOpening the benchmark page in your browser: ${page.url}`);
    console.log('If it does not open, open that address by hand.');
    page.open();

    try {
        const info = await page.page(120000);
        const minutes = Math.max(1, Math.round((drivers.length * RUNS * 26) / 60));
        console.log(`
In the benchmark page, click Start. The page switches to full screen and counts down
while the mouse is still. Then leave the keyboard and mouse alone for about ${minutes} minute${minutes === 1 ? '' : 's'}.
Ctrl+C here stops the run.`);
        await page.ask('start', { minutes }, 0);

        const pointerOk = process.platform !== 'linux';
        const pointers = new Map();
        if (pointerOk) {
            for (const driver of drivers) pointers.set(driver, await calibrate(page, driver));
        }

        const plan = [];
        for (const scenario of scenarios) {
            for (const driver of drivers) {
                let skipped = null;
                if (scenario.pointer === 'required' && !pointerOk) {
                    skipped = 'needs absolute pointer moves, which Kimetra does not have on Linux yet';
                } else if (scenario.pointer && pointerOk && !pointers.get(driver)) {
                    skipped = 'the pointer could not be calibrated over the page';
                }
                plan.push({ scenario, driver, skipped });
            }
        }

        const total = plan.filter(p => !p.skipped).length * RUNS;
        let count = 0;
        const results = [];
        for (const { scenario, driver, skipped } of plan) {
            if (skipped) {
                results.push({ scenario, driver, skipped });
                continue;
            }

            process.stdout.write(`  ${scenario.title}: ${driver.name}...`);
            const runs = [];
            for (let run = 1; run <= RUNS; run++) {
                const label = `Testing ${driver.name}: ${scenario.title}, run ${run}/${RUNS} (${++count}/${total})...`;
                runs.push(await runOnce(page, scenario, driver, pointers, label));
            }
            console.log(` ${runs.filter(r => r.correct).length}/${RUNS} correct`);
            results.push({ scenario, driver, runs });
        }

        await page.ask('done').catch(() => {});
        summaryTable(results, drivers);
        scenarioTables(results);
        return info;
    } finally {
        page.close();
    }
}

(async () => {
    const before = environmentRows();
    print('environment', 'Environment', ['', ''], before);
    loadTimes();
    await callCost();
    await waitAccuracy();

    let browser = null;
    if (INPUT) {
        try {
            const info = await input();
            if (info) browser = `${browserName(info.agent)}${info.isolated ? '' : ' (timestamps coarsened: page not cross-origin isolated)'}`;
        } catch (err) {
            console.error(`\nScenarios stopped: ${err.message}`);
            sections.summary.push(`Scenarios stopped: ${err.message}`);
            process.exitCode = 1;
        }
    } else {
        console.log('\nTo run the scenarios with real input, run: npm run bench -- --input');
    }

    if (REPORT) {
        sections.environment = [];
        const md = ['| | |', '| --- | --- |', ...environmentRows(browser).map(r => `| ${r[0]} | ${r[1]} |`)];
        sections.environment.push(md.join('\n'));
        writeReport();
    }
})().catch(err => {
    console.error(`\nBenchmark failed: ${err.message}`);
    process.exitCode = 1;
});
