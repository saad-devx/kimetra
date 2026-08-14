// Linux evdev/uinput key codes (linux/input-event-codes.h).
// Undirected modifier names (ctrl, shift, alt, meta) resolve to the left-hand key.
module.exports = {
    // Letters
    a: 30, b: 48, c: 46, d: 32, e: 18, f: 33, g: 34,
    h: 35, i: 23, j: 36, k: 37, l: 38, m: 50, n: 49,
    o: 24, p: 25, q: 16, r: 19, s: 31, t: 20, u: 22,
    v: 47, w: 17, x: 45, y: 21, z: 44,

    // Numbers
    0: 11, 1: 2, 2: 3, 3: 4, 4: 5,
    5: 6, 6: 7, 7: 8, 8: 9, 9: 10,

    // Function keys
    f1: 59, f2: 60, f3: 61, f4: 62, f5: 63, f6: 64,
    f7: 65, f8: 66, f9: 67, f10: 68, f11: 87, f12: 88,
    f13: 183, f14: 184, f15: 185, f16: 186,
    f17: 187, f18: 188, f19: 189, f20: 190,

    // Modifiers
    shift: 42, lshift: 42, rshift: 54,
    ctrl: 29, lctrl: 29, rctrl: 97,
    alt: 56, lalt: 56, ralt: 100,
    meta: 125, lmeta: 125, rmeta: 126,
    super: 125, cmd: 125, win: 125, lsuper: 125, rsuper: 126,

    // Editing and control
    backspace: 14, tab: 15, enter: 28, escape: 1, space: 57,
    capslock: 58, insert: 110, delete: 111, menu: 127,

    // Navigation
    left: 105, up: 103, right: 106, down: 108,
    home: 102, end: 107, pageup: 104, pagedown: 109,

    // Numpad
    numpad0: 82, numpad1: 79, numpad2: 80, numpad3: 81, numpad4: 75,
    numpad5: 76, numpad6: 77, numpad7: 71, numpad8: 72, numpad9: 73,
    numpadmultiply: 55, numpadadd: 78, numpadsubtract: 74,
    numpaddecimal: 83, numpaddivide: 98, numpadenter: 96,

    // Symbols
    semicolon: 39, equal: 13, comma: 51, hyphen: 12, dot: 52,
    fslash: 53, grave: 41, backtick: 41, squarebracketstart: 26,
    bslash: 43, squarebracketend: 27, quote: 40,

    // Locks and system
    numlock: 69, scrolllock: 70, printscreen: 99, pause: 119,

    // Media
    volumemute: 113, volumedown: 114, volumeup: 115,
    nexttrack: 163, prevtrack: 165, stopmedia: 166, playpause: 164,

    // Browser
    browserback: 158, browserforward: 159, browserrefresh: 173,
    browserstop: 128, browsersearch: 217, browserfavorites: 156,
    browserhome: 172
};
