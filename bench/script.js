'use strict';

// A typical editing session, written once and run through every library: typing,
// navigation, selection, shortcuts, a pointer square drawn with glides, a click,
// scrolling and short waits. Times are milliseconds. The pointer ends where it started.

const LINE = 'The quick brown fox jumps over the lazy dog.';
const ROUNDS = 3;

function script(platform) {
    const mod = platform === 'darwin' ? 'meta' : 'ctrl';
    const steps = [];

    for (let round = 0; round < ROUNDS; round++) {
        for (let i = 1; i <= 5; i++) {
            steps.push(
                { do: 'type', text: `${i}. ${LINE}` },
                { do: 'key', key: 'enter' },
                { do: 'wait', ms: 20 }
            );
        }

        steps.push(
            { do: 'keys', keys: ['up', 'up', 'up'] },
            { do: 'key', key: 'end' },
            { do: 'hotkey', keys: ['shift', 'home'] },
            { do: 'wait', ms: 30 },
            { do: 'key', key: 'backspace' },
            { do: 'type', text: 'This line was replaced.' },
            { do: 'hotkey', keys: [mod, 'z'] },
            { do: 'wait', ms: 30 },
            { do: 'repeat', key: 'left', times: 10 },
            { do: 'repeat', key: 'right', times: 10 },
            { do: 'scroll', y: 3 },
            { do: 'wait', ms: 30 },
            { do: 'scroll', y: -3 },
            { do: 'glide', dx: 60, dy: 0, ms: 100 },
            { do: 'glide', dx: 0, dy: 60, ms: 100 },
            { do: 'glide', dx: -60, dy: 0, ms: 100 },
            { do: 'glide', dx: 0, dy: -60, ms: 100 },
            { do: 'click' },
            { do: 'wait', ms: 30 },
            { do: 'hotkey', keys: [mod, 'a'] },
            { do: 'wait', ms: 30 },
            { do: 'key', key: 'right' },
            { do: 'key', key: 'enter' }
        );
    }

    return steps;
}

/** Time the script itself asks for: its waits and the length of its glides. */
function planned(steps) {
    return steps.reduce((ms, step) => ms + (step.ms || 0), 0);
}

/** Counts of what the script sends, for the report. */
function contents(steps) {
    const count = { steps: steps.length, characters: 0, keys: 0, hotkeys: 0, glides: 0, scrolls: 0, clicks: 0 };
    for (const step of steps) {
        if (step.do === 'type') count.characters += step.text.length;
        if (step.do === 'key') count.keys += 1;
        if (step.do === 'keys') count.keys += step.keys.length;
        if (step.do === 'repeat') count.keys += step.times;
        if (step.do === 'hotkey') count.hotkeys += 1;
        if (step.do === 'glide') count.glides += 1;
        if (step.do === 'scroll') count.scrolls += 1;
        if (step.do === 'click') count.clicks += 1;
    }
    return count;
}

module.exports = { script, planned, contents };
