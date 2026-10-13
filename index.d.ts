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
     * Gap between repeated actions: keys of `pressKeys`, `repeatKey`, clicks of `click`.
     * @default 700 microseconds
     */
    interval?: number;
    /**
     * How long a single key or mouse button is held down.
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
    | { type: 'down'; key: KeyInput; delay?: number }
    | { type: 'up'; key: KeyInput; delay?: number }
    | { type: 'key'; key: KeyInput; duration?: number; delay?: number }
    | { type: 'keys'; keys: KeyInput[]; interval?: number; delay?: number }
    | { type: 'hotkey'; keys: KeyInput[]; duration?: number; delay?: number }
    | { type: 'repeat'; key: KeyInput; times: number; interval?: number; delay?: number }
    | { type: 'text'; text: string; delay?: number }
    | { type: 'wait'; duration: number }
    | { type: 'move'; x: number; y: number; duration?: number; delay?: number }
    | { type: 'moveby'; x: number; y: number; duration?: number; delay?: number }
    | { type: 'click'; button?: MouseButton; count?: number; delay?: number }
    | { type: 'mousedown'; button?: MouseButton; delay?: number }
    | { type: 'mouseup'; button?: MouseButton; delay?: number }
    | { type: 'scroll'; y: number; x?: number; delay?: number };

export type MouseButton = 'left' | 'right' | 'middle' | 'back' | 'forward';

/** A pointer position: physical pixels on Windows, points on macOS. */
export interface Point {
    x: number;
    y: number;
}

/** The raw native addon. Every argument is a platform key code in microseconds. */
export interface KimetraCore {
    KeyDown(keyCode: number): boolean;
    KeyUp(keyCode: number): boolean;
    SendString(text: string): boolean;
    Sleep(microseconds: number): void;
    /** Runs a batch of `[op, a, b]` records. `length` counts Int32 slots. */
    Run(ops: Int32Array, length: number, texts?: string[]): boolean;
    /** The pointer position, or null where the OS does not expose it. */
    MousePosition(): Point | null;
    Cleanup(): void;
    /** Batch layout the binary was built for. */
    readonly Format: number;
}

/** Editing shortcuts: Cmd on macOS, Ctrl elsewhere. */
export type Shortcut =
    | 'copy' | 'paste' | 'cut' | 'selectAll' | 'undo' | 'redo' | 'save' | 'find' | 'replace';

/**
 * The action methods. A Kimetra instance runs each one and returns a promise; a Kimacro
 * records it and returns the macro, so calls chain.
 */
export interface ActionMethods<R> {
    /** Presses a key down and leaves it held. */
    keyDown(key: KeyInput, delay?: number): R;
    /** Releases a held key. */
    keyUp(key: KeyInput, delay?: number): R;
    /** Presses and releases a key, holding it down for `duration`. */
    pressKey(key: KeyInput, duration?: number, delay?: number): R;
    /** Presses several keys one after another. */
    pressKeys(keys: KeyInput[], interval?: number, delay?: number): R;
    /** Presses keys together as a combination, releasing them in reverse order. */
    pressHotkey(keys: KeyInput[], duration?: number, delay?: number): R;
    /** Presses the same key `times` times. */
    repeatKey(key: KeyInput, times: number, interval?: number, delay?: number): R;
    /** Types text. Unicode is supported on Windows and macOS. */
    typeText(text: string, delay?: number): R;
    /**
     * Moves the pointer to (x, y), gliding there over `duration` when one is given.
     * Not available on Linux yet.
     */
    moveMouse(x: number, y: number, duration?: number, delay?: number): R;
    /** Moves the pointer by (x, y), gliding over `duration` when one is given. */
    moveMouseBy(x: number, y: number, duration?: number, delay?: number): R;
    /** Clicks a button `count` times. Defaults to one left click. */
    click(button?: MouseButton, count?: number, delay?: number): R;
    /** Presses a mouse button down and leaves it held. Defaults to left. */
    mouseDown(button?: MouseButton, delay?: number): R;
    /** Releases a held mouse button. Defaults to left. */
    mouseUp(button?: MouseButton, delay?: number): R;
    /** Scrolls `y` notches down and `x` notches right. Negative values go up and left. */
    scroll(y: number, x?: number, delay?: number): R;
}

export interface KimetraInstance
    extends ActionMethods<Promise<boolean>>,
        Record<Shortcut, (duration?: number, delay?: number) => Promise<boolean>> {
    readonly os: 'win32' | 'darwin' | 'linux';
    readonly arch: string;
    readonly unit: 'microsecond' | 'millisecond';
    /** Direct access to the native addon for full manual control. */
    readonly core: KimetraCore;

    /** Blocks for `duration` with microsecond accuracy. */
    sleep(duration: number): Promise<boolean>;
    /** Reads the pointer position, in the OS's own units. Not available on Linux yet. */
    mousePosition(): Point;
    /** Compiles an entire action list into a single native call. */
    executeSequence(actions: Action[]): Promise<boolean>;

    /** Releases native resources. Safe to call more than once. */
    cleanup(): void;
}

export interface KimacroInstance extends ActionMethods<KimacroInstance> {
    readonly ki: KimetraInstance;
    sequence: Action[];

    add(action: Action): this;
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
