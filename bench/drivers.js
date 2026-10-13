'use strict';

// The same operations, run through each library the way its users would write them.
// Every library's own delays are set to zero; times are milliseconds.

const path = require('path');
const { planned } = require('./script');

const ROOT = path.resolve(__dirname, '..');
const OP_SLEEP = 2; // see src/cpp/backend.h

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function optional(name) {
    try {
        return require(require.resolve(name, { paths: [ROOT] }));
    } catch {
        return null;
    }
}

/** Script steps as Kimetra actions. Glides are absolute where the pointer can be read. */
function toActions(steps, start) {
    let at = start ? { x: start.x, y: start.y } : null;

    return steps.map(step => {
        switch (step.do) {
            case 'type': return { type: 'text', text: step.text };
            case 'key': return { type: 'key', key: step.key };
            case 'keys': return { type: 'keys', keys: step.keys };
            case 'hotkey': return { type: 'hotkey', keys: step.keys };
            case 'repeat': return { type: 'repeat', key: step.key, times: step.times };
            case 'scroll': return { type: 'scroll', y: step.y };
            case 'click': return { type: 'click' };
            case 'wait': return { type: 'wait', duration: step.ms };
            case 'glide':
                if (!at) return { type: 'moveby', x: step.dx, y: step.dy, duration: step.ms };
                at = { x: at.x + step.dx, y: at.y + step.dy };
                return { type: 'move', x: at.x, y: at.y, duration: step.ms };
            default:
                throw new Error(`Unknown script step "${step.do}".`);
        }
    });
}

/**
 * Kimetra, either as one sequence per job or as one call per step with JavaScript waits
 * in between. Counts the time its batches spend in deliberate holds and gaps. With
 * `holds` false, key and click holds are zero, like the other libraries; only the fixed
 * gap between the keys of a shortcut remains. That variant only runs the script.
 */
function kimetra(mode, holds = true) {
    const { Kimetra } = require(ROOT);
    const ki = Kimetra(holds
        ? { unit: 'millisecond' }
        : { unit: 'millisecond', duration: 0, interval: 0, hotkeyDelay: 0 });
    const raw = Kimetra({ unit: 'millisecond', duration: 0, interval: 0 });

    let waitedUs = 0;
    const run = ki._run;
    ki._run = function () {
        for (let i = 0; i < this._len; i += 3) {
            if (this._ops[i] === OP_SLEEP) waitedUs += this._ops[i + 1];
        }
        return run.call(this);
    };

    const sequence = mode === 'sequence';
    const name = !sequence ? 'kimetra, one call per step'
        : holds ? 'kimetra, one sequence' : 'kimetra, one sequence, holds off';

    return {
        name,

        keyTaps: !holds ? null : async count => {
            if (sequence) return raw.repeatKey('f20', count);
            for (let i = 0; i < count; i++) await raw.pressKey('f20');
        },

        pointerMoves: !holds ? null : async (count, start) => {
            const moves = [];
            for (let i = 0; i < count; i++) {
                moves.push(start
                    ? { type: 'move', x: start.x + (i % 2), y: start.y }
                    : { type: 'moveby', x: i % 2 ? -1 : 1, y: 0 });
            }
            if (sequence) return raw.executeSequence(moves);
            for (const move of moves) await raw.executeSequence([move]);
        },

        type: sequence && holds ? text => ki.typeText(text) : null,

        async script(steps, start) {
            waitedUs = 0;
            const actions = toActions(steps, start);
            if (sequence) {
                await ki.executeSequence(actions);
            } else {
                for (const action of actions) {
                    if (action.type === 'wait') await sleep(action.duration);
                    else await ki.executeSequence([action]);
                }
            }

            // Native waits minus the script's own waits that ran natively are the holds
            // and gaps Kimetra adds on purpose.
            const native = sequence ? steps : steps.filter(step => step.do !== 'wait');
            return { holdsMs: waitedUs / 1000 - planned(native) };
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

    return {
        name: 'robotjs',

        async keyTaps(count) {
            for (let i = 0; i < count; i++) robot.keyTap('f20');
        },

        async pointerMoves(count, start) {
            if (!start) return 'skipped';
            for (let i = 0; i < count; i++) robot.moveMouse(start.x + (i % 2), start.y);
        },

        async type(text) {
            robot.typeString(text);
        },

        async script(steps, start) {
            let at = start ? { x: start.x, y: start.y } : robot.getMousePos();
            for (const step of steps) {
                switch (step.do) {
                    case 'type': robot.typeString(step.text); break;
                    case 'key': robot.keyTap(key(step.key)); break;
                    case 'keys': for (const k of step.keys) robot.keyTap(key(k)); break;
                    case 'repeat': for (let i = 0; i < step.times; i++) robot.keyTap(key(step.key)); break;
                    case 'hotkey': {
                        const keys = step.keys.map(key);
                        robot.keyTap(keys[keys.length - 1], keys.slice(0, -1));
                        break;
                    }
                    case 'scroll': robot.scrollMouse(0, -step.y); break;
                    case 'click': robot.mouseClick(); break;
                    case 'wait': await sleep(step.ms); break;
                    case 'glide': {
                        // A point every 4 ms, paced with setTimeout, as a robotjs script would.
                        const points = Math.max(1, Math.round(step.ms / 4));
                        for (let i = 1; i <= points; i++) {
                            robot.moveMouse(
                                Math.round(at.x + (step.dx * i) / points),
                                Math.round(at.y + (step.dy * i) / points)
                            );
                            await sleep(step.ms / points);
                        }
                        at = { x: at.x + step.dx, y: at.y + step.dy };
                        break;
                    }
                }
            }
            return {};
        }
    };
}

function nutjs() {
    const nut = optional('@nut-tree-fork/nut-js') || optional('@nut-tree/nut-js');
    if (!nut) return null;

    const { keyboard, mouse, Key, Point, straightTo } = nut;
    keyboard.config.autoDelayMs = 0;
    mouse.config.autoDelayMs = 0;

    const KEYS = {
        enter: Key.Enter, backspace: Key.Backspace, up: Key.Up, down: Key.Down,
        left: Key.Left, right: Key.Right, home: Key.Home, end: Key.End, f20: Key.F20,
        shift: Key.LeftShift, ctrl: Key.LeftControl,
        meta: process.platform === 'darwin' ? Key.LeftCmd : Key.LeftSuper,
        a: Key.A, z: Key.Z
    };
    const tap = async name => {
        await keyboard.pressKey(KEYS[name]);
        await keyboard.releaseKey(KEYS[name]);
    };

    return {
        name: 'nut.js',

        async keyTaps(count) {
            for (let i = 0; i < count; i++) await tap('f20');
        },

        async pointerMoves(count, start) {
            if (!start) return 'skipped';
            for (let i = 0; i < count; i++) await mouse.setPosition(new Point(start.x + (i % 2), start.y));
        },

        async type(text) {
            await keyboard.type(text);
        },

        async script(steps, start) {
            let at = start ? { x: start.x, y: start.y } : await mouse.getPosition();
            for (const step of steps) {
                switch (step.do) {
                    case 'type': await keyboard.type(step.text); break;
                    case 'key': await tap(step.key); break;
                    case 'keys': for (const k of step.keys) await tap(k); break;
                    case 'repeat': for (let i = 0; i < step.times; i++) await tap(step.key); break;
                    case 'hotkey': {
                        const keys = step.keys.map(k => KEYS[k]);
                        await keyboard.pressKey(...keys);
                        await keyboard.releaseKey(...keys);
                        break;
                    }
                    case 'scroll':
                        if (step.y > 0) await mouse.scrollDown(step.y);
                        else await mouse.scrollUp(-step.y);
                        break;
                    case 'click': await mouse.leftClick(); break;
                    case 'wait': await sleep(step.ms); break;
                    case 'glide': {
                        // nut.js paces a path by speed, so pick the speed that takes step.ms.
                        at = { x: at.x + step.dx, y: at.y + step.dy };
                        mouse.config.mouseSpeed = Math.hypot(step.dx, step.dy) / (step.ms / 1000);
                        await mouse.move(straightTo(new Point(at.x, at.y)));
                        break;
                    }
                }
            }
            return {};
        }
    };
}

/** Kimetra in each mode, then every other library that is installed. */
function load() {
    return [kimetra('sequence'), kimetra('sequence', false), kimetra('calls'), robotjs(), nutjs()]
        .filter(Boolean);
}

module.exports = { load, toActions };
