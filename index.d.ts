/**
 * Kimetra
 *
 * Cross-platform keyboard automation using native OS APIs.
 *
 * @license MIT
 */

/** Key names available on Windows, macOS and Linux alike. */
export type PortableKey =
    | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
    | 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' | 'k' | 'l' | 'm'
    | 'n' | 'o' | 'p' | 'q' | 'r' | 's' | 't' | 'u' | 'v' | 'w' | 'x' | 'y' | 'z'
    | 'f1' | 'f2' | 'f3' | 'f4' | 'f5' | 'f6' | 'f7' | 'f8' | 'f9' | 'f10'
    | 'f11' | 'f12' | 'f13' | 'f14' | 'f15' | 'f16' | 'f17' | 'f18' | 'f19' | 'f20'
    | 'shift' | 'lshift' | 'rshift'
    | 'ctrl' | 'lctrl' | 'rctrl'
    | 'alt' | 'lalt' | 'ralt'
    | 'meta' | 'lmeta' | 'rmeta' | 'super' | 'cmd' | 'win'
    | 'backspace' | 'tab' | 'enter' | 'escape' | 'space' | 'capslock' | 'delete'
    | 'left' | 'up' | 'right' | 'down'
    | 'home' | 'end' | 'pageup' | 'pagedown'
    | 'numpad0' | 'numpad1' | 'numpad2' | 'numpad3' | 'numpad4'
    | 'numpad5' | 'numpad6' | 'numpad7' | 'numpad8' | 'numpad9'
    | 'numpadmultiply' | 'numpadadd' | 'numpadsubtract' | 'numpaddecimal' | 'numpaddivide'
    | 'semicolon' | 'equal' | 'comma' | 'hyphen' | 'dot' | 'fslash'
    | 'grave' | 'backtick' | 'squarebracketstart' | 'bslash' | 'squarebracketend' | 'quote'
    | 'volumemute' | 'volumedown' | 'volumeup';

/**
 * Key names that only exist on some platforms. Using one where the current OS has
 * no such key throws `Unknown key "<name>" on <platform>`.
 */
export type PlatformKey =
    /** Windows only */
    | 'lwin' | 'rwin'
    /** Windows and Linux */
    | 'insert' | 'menu' | 'numlock' | 'scrolllock' | 'printscreen' | 'pause'
    | 'nexttrack' | 'prevtrack' | 'stopmedia' | 'playpause'
    | 'browserback' | 'browserforward' | 'browserrefresh' | 'browserstop'
    | 'browsersearch' | 'browserfavorites' | 'browserhome'
    /** macOS only */
    | 'lcmd' | 'rcmd' | 'help' | 'numpadequal' | 'numpadclear'
    /** macOS and Linux */
    | 'numpadenter'
    /** Linux only */
    | 'lsuper' | 'rsuper';

export type KeyName = PortableKey | PlatformKey;

/** A key name, or a raw platform key code taken from `Key`. */
export type KeyInput = KeyName | number;

export interface KimetraOptions {
    /**
     * Unit for every duration this instance accepts.
     * @default 'microsecond'
     */
    unit?: 'microsecond' | 'millisecond';
    /**
     * Delay before an action starts.
     * @default 0
     */
    delay?: number;
    /**
     * Gap between repeated actions.
     * @default 700 microseconds
     */
    interval?: number;
    /**
     * How long a single key is held down.
     * @default 700 microseconds
     */
    duration?: number;
    /**
     * How long a key combination is held before release.
     * @default 1500 microseconds
     */
    hotkeyDelay?: number;
}

export type Action =
    | { type: 'key'; key: KeyInput; duration?: number; delay?: number }
    | { type: 'keys'; keys: KeyInput[]; interval?: number; delay?: number }
    | { type: 'hotkey'; keys: KeyInput[]; duration?: number; delay?: number }
    | { type: 'repeat'; key: KeyInput; times: number; interval?: number; delay?: number }
    | { type: 'text'; text: string; delay?: number }
    | { type: 'wait'; duration: number };

/** The raw native addon. Every argument is a platform key code in microseconds. */
export interface KimetraCore {
    KeyDown(keyCode: number): boolean;
    KeyUp(keyCode: number): boolean;
    SendString(text: string): boolean;
    Sleep(microseconds: number): void;
    Run(ops: Int32Array, length: number, texts?: string[]): boolean;
    Cleanup(): void;
}

export interface KimetraInstance {
    readonly os: 'win32' | 'darwin' | 'linux';
    readonly arch: string;
    readonly unit: 'microsecond' | 'millisecond';
    /** Direct access to the native addon for full manual control. */
    readonly core: KimetraCore;

    /** Presses a key down and leaves it held. */
    keyDown(key: KeyInput, delay?: number): Promise<boolean>;
    /** Releases a held key. */
    keyUp(key: KeyInput, delay?: number): Promise<boolean>;
    /** Presses and releases a key, holding it down for `duration`. */
    pressKey(key: KeyInput, duration?: number, delay?: number): Promise<boolean>;
    /** Presses several keys one after another. */
    pressKeys(keys: KeyInput[], interval?: number, delay?: number): Promise<boolean>;
    /** Presses keys together as a combination, releasing them in reverse order. */
    pressHotkey(keys: KeyInput[], duration?: number, delay?: number): Promise<boolean>;
    /** Presses the same key `times` times. */
    repeatKey(key: KeyInput, times: number, interval?: number, delay?: number): Promise<boolean>;
    /** Types text. Unicode is supported on Windows and macOS. */
    typeText(text: string, delay?: number): Promise<boolean>;
    /** Blocks for `duration` with microsecond accuracy. */
    sleep(duration: number): Promise<boolean>;
    /** Compiles an entire action list into a single native call. */
    executeSequence(actions: Action[]): Promise<boolean>;

    copy(duration?: number, delay?: number): Promise<boolean>;
    paste(duration?: number, delay?: number): Promise<boolean>;
    cut(duration?: number, delay?: number): Promise<boolean>;
    selectAll(duration?: number, delay?: number): Promise<boolean>;
    undo(duration?: number, delay?: number): Promise<boolean>;
    redo(duration?: number, delay?: number): Promise<boolean>;
    save(duration?: number, delay?: number): Promise<boolean>;
    find(duration?: number, delay?: number): Promise<boolean>;
    replace(duration?: number, delay?: number): Promise<boolean>;

    /** Releases native resources. Safe to call more than once. */
    cleanup(): void;
}

export interface KimacroInstance {
    readonly ki: KimetraInstance;
    sequence: Action[];

    add(action: Action): this;
    pressKey(key: KeyInput, duration?: number, delay?: number): this;
    pressKeys(keys: KeyInput[], interval?: number, delay?: number): this;
    pressHotkey(keys: KeyInput[], duration?: number, delay?: number): this;
    repeatKey(key: KeyInput, times: number, interval?: number, delay?: number): this;
    typeText(text: string, delay?: number): this;
    wait(duration: number): this;

    /** Runs the macro. The sequence is kept, so a macro can be replayed. */
    exec(): Promise<boolean>;
    toJSON(): Action[];
    fromJSON(sequence: Action[]): this;
    clear(): this;
    cleanup(): void;
}

/**
 * Creates a Kimetra instance.
 *
 * @example
 * const ki = Kimetra({ unit: 'millisecond' });
 * await ki.pressHotkey(['ctrl', 'c']);
 * ki.cleanup();
 */
export function Kimetra(options?: KimetraOptions): KimetraInstance;

/**
 * Creates a replayable macro.
 *
 * @example
 * const macro = Kimacro().typeText('hello').pressKey('enter');
 * await macro.exec();
 */
export function Kimacro(options?: KimetraOptions): KimacroInstance;

/**
 * Key codes for the current platform, for use with `instance.core`.
 * Prefer key names with the normal API.
 */
export const Key: Readonly<Record<PortableKey, number>> &
    Partial<Readonly<Record<PlatformKey, number>>>;
