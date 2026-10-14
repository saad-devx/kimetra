'use strict';

// The benchmark scenarios. Each one builds its steps from a fixed seed, so every library
// runs exactly the same thing, and checks what the benchmark page received.
//
// Times are milliseconds. Steps:
//   { do: 'type', text }             type text in one call
//   { do: 'key', key }               tap a key
//   { do: 'down' | 'up', key }       press or release a key
//   { do: 'hotkey', keys }           press keys together
//   { do: 'wait', ms }
//   { do: 'move', x, y, ms }         glide to a point, in screen CSS pixels of the page
//   { do: 'click', button, count }
//   { do: 'press' | 'release' }      left button down or up
//   { do: 'scroll', notches }        positive scrolls down

/** A small seeded generator (mulberry32), so the "random" rhythm is the same every run. */
function seeded(seed) {
    return () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const between = (random, low, high) => Math.round(low + random() * (high - low));

/** Time the steps ask for on purpose: waits plus the length of glides. */
function planned(steps) {
    return steps.reduce((ms, step) => ms + (step.ms || 0), 0);
}

/** When each step starts, measured from the first step, for the steps `pick` selects. */
function schedule(steps, pick) {
    const times = [];
    let t = 0;
    for (const step of steps) {
        if (pick(step)) times.push(t);
        t += step.ms || 0;
    }
    return times;
}

/** How far each gap between consecutive events was from the planned gap. */
function gapErrors(actual, plan) {
    const errors = [];
    for (let i = 1; i < actual.length; i++) {
        errors.push(Math.abs((actual[i] - actual[i - 1]) - (plan[i] - plan[i - 1])));
    }
    return errors;
}

/** A glide's length: longer for longer distances, like a hand. */
function glide(random, from, to) {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    return Math.min(650, Math.max(120, Math.round(150 + distance * 0.5) + between(random, -40, 40)));
}

const preview = text => JSON.stringify(text.length > 40 ? `${text.slice(0, 40)}...` : text);

// ==================================================

const taps = {
    id: 'taps',
    title: 'Key taps',
    scene: 'keys',
    synthetic: true,
    about: '500 taps of F20, sent as fast as each library can.',

    build() {
        return Array.from({ length: 500 }, () => ({ do: 'key', key: 'f20' }));
    },

    check(result) {
        const received = result.log.filter(e => e.type === 'keydown' && (e.code === 'F20' || e.key === 'F20')).length;
        return { correct: received === 500, detail: `${received}/500 received`, received };
    }
};

const SENTENCE = 'Send the report by Friday, then call Sam about the budget.';

const typing = {
    id: 'typing',
    title: 'Typing',
    scene: 'typing',
    about: 'One sentence typed a character at a time, 15 to 115 ms apart, longer after spaces and commas.',

    build() {
        const random = seeded(7);
        const steps = [];
        for (const ch of SENTENCE) {
            let ms = between(random, 15, 35);
            if (ch === ' ') ms += between(random, 5, 20);
            if (ch === ',') ms += between(random, 40, 80);
            steps.push({ do: 'type', text: ch }, { do: 'wait', ms });
        }
        steps.pop();
        return steps;
    },

    check(result, steps) {
        const text = result.state.text || '';
        const correct = text === SENTENCE;
        const typed = result.log.filter(e => e.type === 'input' && e.kind === 'insertText');
        const plan = schedule(steps, step => step.do === 'type');
        return {
            correct,
            detail: correct ? 'text matches' : `typed ${preview(text)}`,
            errors: typed.length === plan.length ? gapErrors(typed.map(e => e.t), plan) : null
        };
    }
};

const FORM = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '+44 20 7946 0958',
    city: 'London',
    notes: 'Prefers email.\nAvailable after 3 pm.'
};

const form = {
    id: 'form',
    title: 'Filling a form',
    scene: 'form',
    pointer: 'optional',
    about: 'Five fields reached by pointer glides and clicks, with pauses, a select-all retype, ' +
        'a corrected typo and a two-line note, then a click on Submit. Without a pointer, Tab moves between fields.',

    build(targets, { pointer, mod }) {
        const random = seeded(11);
        const steps = [];
        let at = targets.centre;

        const goTo = target => {
            steps.push(
                { do: 'move', x: target.x, y: target.y, ms: glide(random, at, target) },
                { do: 'wait', ms: between(random, 60, 150) },
                { do: 'click', button: 'left', count: 1 }
            );
            at = target;
        };

        const fields = ['name', 'email', 'phone', 'city', 'notes'];
        fields.forEach((field, i) => {
            if (pointer) goTo(targets[field]);
            else if (i > 0) steps.push({ do: 'key', key: 'tab' });
            steps.push({ do: 'wait', ms: between(random, 120, 260) });

            if (field === 'name') {
                steps.push(
                    { do: 'type', text: 'Ada Lovelac' },
                    { do: 'wait', ms: between(random, 150, 260) },
                    { do: 'hotkey', keys: [mod, 'a'] },
                    { do: 'wait', ms: between(random, 100, 180) },
                    { do: 'type', text: FORM.name }
                );
            } else if (field === 'city') {
                steps.push(
                    { do: 'type', text: 'Londno' },
                    { do: 'wait', ms: between(random, 200, 320) },
                    { do: 'key', key: 'backspace' },
                    { do: 'wait', ms: between(random, 60, 110) },
                    { do: 'key', key: 'backspace' },
                    { do: 'wait', ms: between(random, 80, 140) },
                    { do: 'type', text: 'on' }
                );
            } else if (field === 'notes') {
                const [first, second] = FORM.notes.split('\n');
                steps.push({ do: 'type', text: first }, { do: 'key', key: 'enter' }, { do: 'type', text: second });
            } else {
                steps.push({ do: 'type', text: FORM[field] });
            }

            steps.push({ do: 'wait', ms: between(random, 150, 380) });
        });

        if (pointer) goTo(targets.submit);
        else steps.push({ do: 'key', key: 'tab' }, { do: 'wait', ms: 120 }, { do: 'key', key: 'enter' });
        return steps;
    },

    check(result) {
        const values = (result.state && result.state.values) || {};
        const right = Object.keys(FORM).filter(field => values[field] === FORM[field]).length;
        const submitted = Boolean(result.state && result.state.submitted);
        return {
            correct: right === 5 && submitted,
            detail: `${right}/5 fields, ${submitted ? 'submitted' : 'not submitted'}`,
            errors: null
        };
    }
};

const GAME_CODES = { w: 'KeyW', a: 'KeyA', d: 'KeyD', space: 'Space', shift: 'ShiftLeft' };

function codeOf(event) {
    if (event.code) return event.code;
    if (event.key === ' ') return 'Space';
    if (event.key === 'Shift') return 'ShiftLeft';
    return `Key${event.key.toUpperCase()}`;
}

const game = {
    id: 'game',
    title: 'Game macro',
    scene: 'keys',
    about: 'Three rounds of movement keys with overlapping holds, a jump while running and a sprint, ' +
        'every press and release on a planned schedule.',

    build() {
        const random = seeded(23);
        const steps = [];
        const hold = (key, ms) => steps.push({ do: 'down', key }, { do: 'wait', ms }, { do: 'up', key });

        for (let round = 0; round < 3; round++) {
            steps.push(
                { do: 'down', key: 'w' }, { do: 'wait', ms: between(random, 140, 260) },
                { do: 'down', key: 'space' }, { do: 'wait', ms: between(random, 40, 80) },
                { do: 'up', key: 'space' }, { do: 'wait', ms: between(random, 60, 140) },
                { do: 'up', key: 'w' }, { do: 'wait', ms: between(random, 40, 120) }
            );
            hold('a', between(random, 90, 180));
            steps.push({ do: 'wait', ms: between(random, 30, 80) });
            hold('d', between(random, 90, 180));
            steps.push(
                { do: 'wait', ms: between(random, 60, 140) },
                { do: 'down', key: 'shift' }, { do: 'wait', ms: between(random, 20, 40) },
                { do: 'down', key: 'w' }, { do: 'wait', ms: between(random, 120, 220) },
                { do: 'up', key: 'w' }, { do: 'wait', ms: between(random, 10, 20) },
                { do: 'up', key: 'shift' }, { do: 'wait', ms: between(random, 80, 160) }
            );
        }
        steps.pop();
        return steps;
    },

    check(result, steps) {
        const keyed = step => step.do === 'down' || step.do === 'up';
        const expected = steps.filter(keyed).map(step => `${step.do}:${GAME_CODES[step.key]}`);
        const events = result.log
            .filter(e => e.type === 'keydown' || e.type === 'keyup')
            .map(e => ({ t: e.t, id: `${e.type === 'keydown' ? 'down' : 'up'}:${codeOf(e)}` }));

        let inOrder = 0;
        while (inOrder < expected.length && events[inOrder] && events[inOrder].id === expected[inOrder]) inOrder++;
        const correct = inOrder === expected.length && events.length === expected.length;

        return {
            correct,
            detail: `${inOrder}/${expected.length} key events in order`,
            errors: correct ? gapErrors(events.map(e => e.t), schedule(steps, keyed)) : null
        };
    }
};

const KINDS = ['left', 'double', 'left', 'right', 'left'];

const mouse = {
    id: 'mouse',
    title: 'Mouse workflow',
    scene: 'mouse',
    pointer: 'required',
    about: 'Glides to five targets at varied distances with a pause before each click, one of them ' +
        'a double click and one a right click, then a drag and drop and scrolling a list.',

    layout(size) {
        const random = seeded(31);
        const a = Math.max(220, Math.min(size.width / 2 - 100, 420));
        const b = Math.max(180, Math.min(size.height / 2 - 120, 300));
        return {
            targets: KINDS.map((kind, i) => ({
                id: `t${i + 1}`,
                label: String(i + 1),
                kind,
                dx: Math.round(-a * 0.8 + (i * 1.6 * a) / 4 + between(random, -30, 30)),
                dy: Math.round(-b * 0.3 - random() * b * 0.5)
            })),
            card: { dx: Math.round(-a * 0.6), dy: Math.round(b * 0.55) },
            zone: { dx: Math.round(-a * 0.05), dy: Math.round(b * 0.55) },
            list: { dx: Math.round(a * 0.62), dy: Math.round(b * 0.4) }
        };
    },

    build(targets, ctx, layout) {
        const random = seeded(37);
        const steps = [];
        let at = targets.centre;
        const move = (target, ms) => {
            steps.push({ do: 'move', x: target.x, y: target.y, ms: ms || glide(random, at, target) });
            at = target;
        };

        // Visit the targets out of order, so the distances vary.
        const order = layout.targets.map(t => t.id);
        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }

        for (const id of order) {
            const kind = layout.targets.find(t => t.id === id).kind;
            move(targets[id]);
            steps.push({ do: 'wait', ms: between(random, 70, 180) });
            steps.push({ do: 'click', button: kind === 'right' ? 'right' : 'left', count: kind === 'double' ? 2 : 1 });
            steps.push({ do: 'wait', ms: between(random, 120, 260) });
        }

        move(targets.card);
        steps.push({ do: 'wait', ms: between(random, 100, 160) }, { do: 'press' }, { do: 'wait', ms: between(random, 60, 100) });
        move(targets.zone, between(random, 350, 500));
        steps.push({ do: 'wait', ms: between(random, 80, 140) }, { do: 'release' }, { do: 'wait', ms: between(random, 150, 250) });

        move(targets.list);
        steps.push({ do: 'wait', ms: between(random, 100, 180) });
        for (let i = 0; i < 4; i++) {
            if (i > 0) steps.push({ do: 'wait', ms: between(random, 70, 140) });
            steps.push({ do: 'scroll', notches: 1 });
        }
        steps.push({ do: 'wait', ms: between(random, 200, 300) });
        for (let i = 0; i < 2; i++) {
            if (i > 0) steps.push({ do: 'wait', ms: between(random, 80, 140) });
            steps.push({ do: 'scroll', notches: -1 });
        }
        return steps;
    },

    check(result, steps, layout) {
        const state = result.state || {};
        const tally = state.tally || {};
        const expected = { left: { click: 1, double: 0, right: 0 }, double: { click: 2, double: 1, right: 0 }, right: { click: 0, double: 0, right: 1 } };
        const hits = layout.targets.filter(t => JSON.stringify(tally[t.id]) === JSON.stringify(expected[t.kind])).length;
        const dropped = Boolean(state.dropped);
        const scrolled = state.scrollTop > 0;

        // Timing: when each click and the drag start, from the first press of each.
        const pressing = step => step.do === 'click' || step.do === 'press';
        const presses = result.log.filter(e => e.type === 'pointerdown');
        const starts = [];
        let p = 0;
        for (const step of steps.filter(pressing)) {
            if (presses[p]) starts.push(presses[p].t);
            p += step.count || 1;
        }

        return {
            correct: hits === layout.targets.length && dropped && scrolled,
            detail: `${hits}/${layout.targets.length} targets, ${dropped ? 'dropped' : 'not dropped'}, ${scrolled ? 'scrolled' : 'not scrolled'}`,
            errors: p === presses.length ? gapErrors(starts, schedule(steps, pressing)) : null
        };
    }
};

module.exports = { scenarios: [taps, typing, form, game, mouse], planned };
