const OS = process.platform;
const ARCH = process.arch;
const KeyMap = require('./core/win32.js')
const Binary = require('./bin/win32x64.node')

class Kimetra {
    constructor(options = {}) {
        if (!Binary) {
            throw new Error(`Kimetra is not supported on this platform: ${OS}`);
        }

        // roots
        this.os = OS;
        this.arch = ARCH;
        this.core = Binary
        this.sleep = Binary.Sleep

        // options
        this.defaultDelay = options.delay || 0;
        this.defaultInterval = options.interval || 700;
        this.defaultDuration = options.duration || 700;
        this.defaultHotkeyDelay = options.hotkeyDelay || 1500;
    }

    /**
     * Press a key down
     * @param {string} key - Key to press
     */
    async keyDown(keyCode, delay = this.defaultDelay) {
        if (keyCode === undefined) {
            throw new Error(`Unsupported key: ${key}`);
        }
        if (delay > 0) {
            await Binary.Sleep(delay);
        }
        Binary.KeyDown(keyCode);
    }

    /**
     * Release a key
     * @param {string} key - Key to release
     */
    async keyUp(keyCode, delay = this.defaultDelay) {
        if (keyCode === undefined) {
            throw new Error(`Unsupported key: ${key}`);
        }
        if (delay > 0) {
            await Binary.Sleep(delay);
        }
        Binary.KeyUp(keyCode);
    }

    /**
     * Press and release a key
     * @param {string} key - Key to press
     * @param {number} duration - Duration to hold key in milliseconds
     */
    async pressKey(keyCode, duration = this.defaultDuration, delay = this.defaultDelay) {
        if (keyCode === undefined) {
            throw new Error(`Unsupported key: ${key}`);
        }
        if (delay > 0) {
            await Binary.Sleep(delay);
        }
        Binary.KeyDown(keyCode);
        await Binary.Sleep(duration);
        Binary.KeyUp(keyCode);
    }

    /**
     * Type text with unicode chars support
     * @param {string} text - Text to type
     */
    async typeText(string, delay = this.defaultDelay) {
        if (delay > 0) {
            await Binary.Sleep(delay);
        }
        Binary.SendString(string);
    }

    /**
     * Press multiple keys in sequence
     * @param {string[]} keys - Array of keys to press
     * @param {number} interval - Interval between key presses (ms)
     * @param {number} delay - Initial delay (ms)
     */
    async pressKeys(keys, interval = this.defaultInterval, delay = this.defaultDelay) {
        if (delay > 0) {
            await Binary.Sleep(delay);
        }
        for (let i = 0; i < keys.length; i++) {
            if (delay > 0) {
                await Binary.Sleep(interval);
            }
            Binary.KeyDown(keys[i]);
            await Binary.Sleep(this.defaultDuration);
            Binary.KeyUp(keys[i]);
        }
    }

    /**
     * Press key combination (hotkey)
     * @param {string[]} keys - Array of keys to press simultaneously
     * @param {number} duration - Duration to hold keys (ms)
     * @param {number} delay - Delay before action (ms)
     */
    async pressHotkey(keys, duration = this.defaultHotkeyDelay, delay = this.defaultDelay) {
        if (delay > 0) {
            await Binary.Sleep(delay);
        }

        // Pressing down all keys
        for (const key of keys) {
            Binary.KeyDown(key);
            await Binary.Sleep(5);
        }

        await Binary.Sleep(duration);

        // Releasing keys in reverse order
        for (let i = keys.length - 1; i >= 0; i--) {
            Binary.KeyUp(keys[i]);
            await Binary.Sleep(2);
        }
    }

    /**
     * Hold a key for a specific duration
     * @param {string} key - Key to hold
     * @param {number} duration - Duration to hold (ms)
     * @param {number} delay - Delay before action (ms)
     */
    async holdKey(keyCode, duration = 1000, delay = this.defaultDelay) {
        if (keyCode === undefined) {
            throw new Error(`Unsupported key: ${key}`);
        }
        if (delay > 0) {
            await Binary.Sleep(delay);
        }

        Binary.KeyDown(keyCode);
        await Binary.Sleep(duration);
        Binary.KeyUp(keyCode);
    }

    /**
     * Repeat a key press multiple times
     * @param {string} key - Key to repeat
     * @param {number} times - Number of repetitions
     * @param {number} interval - Interval between repetitions (ms)
     * @param {number} delay - Initial delay (ms)
     */
    async repeatKey(keyCode, times, interval = 50, delay = this.defaultDelay) {
        if (keyCode === undefined) {
            throw new Error(`Unsupported key: ${key}`);
        }
        if (delay > 0) {
            await Binary.Sleep(delay);
        }

        for (let i = 0; i < times; i++) {
            await this.pressKey(keyCode);
            if (i < times - 1 && interval > 0) {
                await Binary.Sleep(interval);
            }
        }
    }

    /**
     * Execute a sequence of keyboard actions
     * @param {Array} actions - Array of action objects
     */
    async executeSequence(actions) {
        const actTypes = {
            key: (a) => this.pressKey(a.key, a.duration, a.delay),
            hotkey: (a) => this.pressHotkey(a.keys, a.duration, a.delay),
            type: (a) => this.typeText(a.text, a.delay),
            hold: (a) => this.holdKey(a.key, a.duration, a.delay),
            wait: (a) => Binary.Sleep(a.interval || this.defaultInterval)
        };

        for (const action of actions) {
            const actFn = actTypes[action.type];
            if (actFn) {
                await actFn(action);
            } else {
                console.warn(`Unknown action type: ${action.type}`);
            }
        }
    }

    // ====================
    // CONVENIENCE METHODS
    // ====================

    // Text editing shortcuts
    async copy(hotkeyDelay = this.defaultHotkeyDelay, delay = this.defaultDelay) { return this.pressHotkey([KeyMap.ctrl, KeyMap.c], hotkeyDelay, delay); }
    async paste(hotkeyDelay = this.defaultHotkeyDelay, delay = this.defaultDelay) { return this.pressHotkey([KeyMap.ctrl, KeyMap.v], hotkeyDelay, delay); }
    async cut(hotkeyDelay = this.defaultHotkeyDelay, delay = this.defaultDelay) { return this.pressHotkey([KeyMap.ctrl, KeyMap.x], hotkeyDelay, delay); }
    async selectAll(hotkeyDelay = this.defaultHotkeyDelay, delay = this.defaultDelay) { return this.pressHotkey([KeyMap.ctrl, KeyMap.a], hotkeyDelay, delay); }
    async undo(hotkeyDelay = this.defaultHotkeyDelay, delay = this.defaultDelay) { return this.pressHotkey([KeyMap.ctrl, KeyMap.z], hotkeyDelay, delay); }
    async redo(hotkeyDelay = this.defaultHotkeyDelay, delay = this.defaultDelay) { return this.pressHotkey([KeyMap.ctrl, KeyMap.y], hotkeyDelay, delay); }
    async save(hotkeyDelay = this.defaultHotkeyDelay, delay = this.defaultDelay) { return this.pressHotkey([KeyMap.ctrl, KeyMap.s], hotkeyDelay, delay); }
    async find(hotkeyDelay = this.defaultHotkeyDelay, delay = this.defaultDelay) { return this.pressHotkey([KeyMap.ctrl, KeyMap.f], hotkeyDelay, delay); }
    async replace(hotkeyDelay = this.defaultHotkeyDelay, delay = this.defaultDelay) { return this.pressHotkey([KeyMap.ctrl, KeyMap.h], hotkeyDelay, delay); }

    // Navigation shortcuts
    async altTab(hotkeyDelay = this.defaultHotkeyDelay, delay = this.defaultDelay) { return this.pressHotkey([KeyMap.alt, KeyMap.tab], hotkeyDelay, delay); }
    async altF4(hotkeyDelay = this.defaultHotkeyDelay, delay = this.defaultDelay) { return this.pressHotkey([KeyMap.alt, KeyMap.f4], hotkeyDelay, delay); }
    async winKey(hotkeyDelay = this.defaultHotkeyDelay, delay = this.defaultDelay) { return this.pressKey('lwin', hotkeyDelay, delay); }
    async taskManager(hotkeyDelay = this.defaultHotkeyDelay, delay = this.defaultDelay) { return this.pressHotkey([KeyMap.ctrl, KeyMap.shift, KeyMap.escape], hotkeyDelay, delay); }

    // macOS specific shortcuts
    async cmdCopy(hotkeyDelay = this.defaultHotkeyDelay, delay = this.defaultDelay) { return this.pressHotkey([KeyMap.cmd, KeyMap.c], hotkeyDelay, delay); }
    async cmdPaste(hotkeyDelay = this.defaultHotkeyDelay, delay = this.defaultDelay) { return this.pressHotkey([KeyMap.cmd, KeyMap.v], hotkeyDelay, delay); }
    async cmdCut(hotkeyDelay = this.defaultHotkeyDelay, delay = this.defaultDelay) { return this.pressHotkey([KeyMap.cmd, KeyMap.x], hotkeyDelay, delay); }
    async cmdSave(hotkeyDelay = this.defaultHotkeyDelay, delay = this.defaultDelay) { return this.pressHotkey([KeyMap.cmd, KeyMap.s], hotkeyDelay, delay); }
    async cmdTab(hotkeyDelay = this.defaultHotkeyDelay, delay = this.defaultDelay) { return this.pressHotkey([KeyMap.cmd, KeyMap.tab], hotkeyDelay, delay); }

    // Arrow keys
    async arrowUp(times = 1, interval = this.defaultInterval, delay = this.defaultDelay) {
        return this.repeatKey(KeyMap.up, times, interval, delay);
    }
    async arrowDown(times = 1, interval = this.defaultInterval, delay = this.defaultDelay) {
        return this.repeatKey(KeyMap.down, times, interval, delay);
    }
    async arrowLeft(times = 1, interval = this.defaultInterval, delay = this.defaultDelay) {
        return this.repeatKey(KeyMap.left, times, interval, delay);
    }
    async arrowRight(times = 1, interval = this.defaultInterval, delay = this.defaultDelay) {
        return this.repeatKey(KeyMap.right, times, interval, delay);
    }

    // Special keys
    async tab(times = 1, interval = this.defaultInterval, delay = this.defaultDelay) {
        return this.repeatKey(KeyMap.tab, times, interval, delay);
    }
    async space(times = 1, interval = this.defaultInterval, delay = this.defaultDelay) {
        return this.repeatKey(KeyMap.space, times, interval, delay);
    }
    async backspace(times = 1, interval = this.defaultInterval, delay = this.defaultDelay) {
        return this.repeatKey(KeyMap.backspace, times, interval, delay);
    }
    async delete(times = 1, interval = this.defaultInterval, delay = this.defaultDelay) {
        return this.repeatKey(KeyMap.delete, times, interval, delay);
    }

    /**
     * Cleanup function
     */
    cleanup() {
        if (Binary.Cleanup) {
            Binary.Cleanup();
        }
    }
}

class Kimacro {
    constructor(sequence = []) {
        this.ki = new Kimetra();
        this.sequence = sequence;
    }

    add(action) {
        this.sequence.push(action);
        return this;
    }

    async exec() {
        const result = await this.ki.executeSequence(this.sequence);
        this.cleanup();
        return result;
    }

    pressKey(key, duration, delay) {
        return this.add({ type: 'key', key, duration, delay });
    }

    typeText(text, delay) {
        return this.add({ type: 'type', text, delay });
    }

    pressHotkey(keys, duration, delay) {
        return this.add({ type: 'hotkey', keys, duration, delay });
    }

    wait(duration) {
        return this.add({ type: 'wait', duration });
    }

    toJSON() {
        return this.sequence
    }

    fromJSON(sequence) {
        if (!Array.isArray(sequence) || !sequence.length) {
            throw new Error("The argument must be a valid array of action objects.")
        }
        this.sequence = sequence || [];
        return this;
    }

    cleanup() {
        this.sequence = [];
        this.ki.cleanup();
    }
}

// Quick actions
const quickActions = {
    async pressKey(...args) {
        const ki = new Kimetra();
        await ki.pressKey(...args);
        api.cleanup();
    },

    async pressHotkey(...args) {
        const ki = new Kimetra();
        await ki.pressHotkey(...args);
        api.cleanup();
    },

    async typeText(...args) {
        const ki = new Kimetra();
        await ki.typeText(...args);
        api.cleanup();
    },

    async copy(delay) {
        const ki = new Kimetra();
        await ki.copy(delay);
        api.cleanup();
    },

    async paste(delay) {
        const ki = new Kimetra();
        await ki.paste(delay);
        api.cleanup();
    },

    async altTab(delay) {
        const ki = new Kimetra();
        await ki.altTab(delay);
        api.cleanup();
    },

    copyPaste: async (delay = 100) => {
        const ki = new Kimetra();
        await ki.copy();
        await ki.sleep(delay);
        await ki.paste();
        api.cleanup();
    },

    selectAllCopy: async () => {
        const ki = new Kimetra();
        await ki.selectAll();
        await ki.copy();
        api.cleanup();
    },

    selectAllPaste: async () => {
        const ki = new Kimetra();
        await ki.selectAll();
        await ki.copy();
        api.cleanup();
    }
};

// Factory functions
function createKimetra(options = {
    delay: 0,
    interval: 700,
    duration: 700,
    hotkeyDelay: 1500
}) {
    return new Kimetra(options);
}

function createKimacro(api, sequence = []) {
    return new Kimacro(api, sequence);
}

// Exports
module.exports = {
    Key: KeyMap,
    Kimetra,
    Kimacro,
    createKimetra,
    createKimacro,
    quickActions,
}