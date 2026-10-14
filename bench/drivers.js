'use strict';

// Runs scenario steps (see scenarios.js) through each library, the way its users would
// write them. Every library's own delays are set to zero. Pointer coordinates arrive in
// the library's own units; bench.js converts them.

const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// One wheel notch in each library's scroll units: raw wheel data on Windows (120 per
// notch), pixels on macOS, button clicks on Linux.
const NOTCH = { win32: 120, darwin: 10, linux: 1 }[process.platform];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function optional(name) {
    try {
        return require(require.resolve(name, { paths: [ROOT] }));
    } catch {
        return null;
    }
}

/** A step as a Kimetra action. Times are milliseconds, so the instances use that unit. */
function toAction(step) {
    switch (step.do) {
        case 'type': return { type: 'text', text: step.text };
        case 'key': return { type: 'key', key: step.key };
        case 'down':
        case 'up': return { type: step.do, key: step.key };
        case 'hotkey': return { type: 'hotkey', keys: step.keys };
        case 'wait': return { type: 'wait', duration: step.ms };
        case 'move': return { type: 'move', x: step.x, y: step.y, duration: step.ms };
        case 'click': return { type: 'click', button: step.button, count: step.count };
        case 'press': return { type: 'mousedown' };
        case 'release': return { type: 'mouseup' };
        case 'scroll': return { type: 'scroll', y: step.notches };
        default: throw new Error(`Unknown step "${step.do}".`);
    }
}

/**
 * Kimetra as one sequence per run, or as one call per step with JavaScript waits in
 * between, the way the other libraries are used. `raw` drops the default key holds for
 * the synthetic key-tap test, since the other libraries hold keys for zero time.
 */
function kimetra(mode) {
    const { Kimetra } = require(ROOT);
    const ki = Kimetra({ unit: 'millisecond' });
    const raw = Kimetra({ unit: 'millisecond', duration: 0, interval: 0 });
    const sequence = mode === 'sequence';

    return {
        name: sequence ? 'kimetra, one sequence' : 'kimetra, one call per step',
        position: () => ki.mousePosition(),
        jump: (x, y) => ki.moveMouse(x, y),

        async run(steps, { synthetic } = {}) {
            const target = synthetic ? raw : ki;
            if (sequence) return target.executeSequence(steps.map(toAction));
            for (const step of steps) {
                if (step.do === 'wait') await sleep(step.ms);
                else await target.executeSequence([toAction(step)]);
            }
        }
    };
}

function robotjs() {
    const robot = optional('robotjs');
    if (!robot) return null;

    robot.setKeyboardDelay(0);
    robot.setMouseDelay(0);
    const NAMES = { ctrl: 'control', meta: 'command' };
    const key = name => NAMES[name] || name;

    // robotjs has no timed glide. Every 4 ms (or whenever setTimeout fires) the pointer
    // goes where the glide should be by then, so the glide takes its planned time.
    async function glide({ x, y, ms }) {
        if (!ms) return robot.moveMouse(x, y);
        const from = robot.getMousePos();
        const start = performance.now();
        for (;;) {
            const done = Math.min(1, (performance.now() - start) / ms);
            robot.moveMouse(Math.round(from.x + (x - from.x) * done), Math.round(from.y + (y - from.y) * done));
            if (done === 1) return;
            await sleep(4);
        }
    }

    return {
        name: 'robotjs',
        position: () => robot.getMousePos(),
        jump: (x, y) => robot.moveMouse(x, y),

        async run(steps) {
            for (const step of steps) {
                switch (step.do) {
                    case 'type': robot.typeString(step.text); break;
                    case 'key': robot.keyTap(key(step.key)); break;
                    case 'down': robot.keyToggle(key(step.key), 'down'); break;
                    case 'up': robot.keyToggle(key(step.key), 'up'); break;
                    case 'hotkey': {
                        const keys = step.keys.map(key);
                        robot.keyTap(keys[keys.length - 1], keys.slice(0, -1));
                        break;
                    }
                    case 'wait': await sleep(step.ms); break;
                    case 'move': await glide(step); break;
                    case 'click': robot.mouseClick(step.button, step.count === 2); break;
                    case 'press': robot.mouseToggle('down', 'left'); break;
                    case 'release': robot.mouseToggle('up', 'left'); break;
                    case 'scroll': robot.scrollMouse(0, -step.notches * NOTCH); break;
                    default: throw new Error(`Unknown step "${step.do}".`);
                }
            }
        }
    };
}

function nutjs() {
    const nut = optional('@nut-tree-fork/nut-js') || optional('@nut-tree/nut-js');
    if (!nut) return null;

    const { keyboard, mouse, Key, Button, Point, straightTo } = nut;
    keyboard.config.autoDelayMs = 0;
    mouse.config.autoDelayMs = 0;

    const KEYS = {
        f20: Key.F20, tab: Key.Tab, enter: Key.Enter, backspace: Key.Backspace, space: Key.Space,
        shift: Key.LeftShift, ctrl: Key.LeftControl,
        meta: process.platform === 'darwin' ? Key.LeftCmd : Key.LeftSuper,
        w: Key.W, a: Key.A, d: Key.D
    };
    const key = name => {
        if (KEYS[name] === undefined) throw new Error(`No nut.js key for "${name}".`);
        return KEYS[name];
    };

    // nut.js paces a path by speed, so pick the speed that takes step.ms.
    async function glide({ x, y, ms }) {
        const from = await mouse.getPosition();
        const distance = Math.hypot(x - from.x, y - from.y);
        if (!ms || !distance) return mouse.setPosition(new Point(x, y));
        mouse.config.mouseSpeed = distance / (ms / 1000);
        await mouse.move(straightTo(new Point(x, y)));
    }

    return {
        name: 'nut.js',
        position: () => mouse.getPosition(),
        jump: (x, y) => mouse.setPosition(new Point(x, y)),

        async run(steps) {
            for (const step of steps) {
                switch (step.do) {
                    case 'type': await keyboard.type(step.text); break;
                    case 'key':
                        await keyboard.pressKey(key(step.key));
                        await keyboard.releaseKey(key(step.key));
                        break;
                    case 'down': await keyboard.pressKey(key(step.key)); break;
                    case 'up': await keyboard.releaseKey(key(step.key)); break;
                    case 'hotkey': {
                        const keys = step.keys.map(key);
                        await keyboard.pressKey(...keys);
                        await keyboard.releaseKey(...keys);
                        break;
                    }
                    case 'wait': await sleep(step.ms); break;
                    case 'move': await glide(step); break;
                    case 'click': {
                        const button = step.button === 'right' ? Button.RIGHT : Button.LEFT;
                        if (step.count === 2) await mouse.doubleClick(button);
                        else await mouse.click(button);
                        break;
                    }
                    case 'press': await mouse.pressButton(Button.LEFT); break;
                    case 'release': await mouse.releaseButton(Button.LEFT); break;
                    case 'scroll':
                        if (step.notches > 0) await mouse.scrollDown(step.notches * NOTCH);
                        else await mouse.scrollUp(-step.notches * NOTCH);
                        break;
                    default: throw new Error(`Unknown step "${step.do}".`);
                }
            }
        }
    };
}

/** Kimetra in both modes, then every other library that is installed. */
function load() {
    return [kimetra('sequence'), kimetra('calls'), robotjs(), nutjs()].filter(Boolean);
}

module.exports = { load, toAction };
