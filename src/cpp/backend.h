#pragma once

#include <napi.h>
#include <string>

namespace kimetra
{
    // Batch layout: [op, a, b] int32 records, mirrored in src/kimetra.js.
    // Bump when the layout or the set of ops changes.
    constexpr int BATCH_FORMAT = 3;

    enum Op
    {
        OP_DOWN = 0,        // a = key code
        OP_UP = 1,          // a = key code
        OP_SLEEP = 2,       // a = microseconds
        OP_TEXT = 3,        // a = index into the texts array
        OP_MOVE = 4,        // a, b = x, y
        OP_BUTTON_DOWN = 5, // a = button, b = click count
        OP_BUTTON_UP = 6,   // a = button, b = click count
        OP_SCROLL = 7,      // a, b = notches down, notches right
        OP_MOVE_BY = 8      // a, b = dx, dy
    };

    // Mouse buttons, numbered as in src/kimetra.js.
    enum Button
    {
        BUTTON_LEFT = 0,
        BUTTON_RIGHT = 1,
        BUTTON_MIDDLE = 2,
        BUTTON_BACK = 3,
        BUTTON_FORWARD = 4
    };

    // Waits sleep until this far before the deadline, then spin.
    constexpr int SPIN_MARGIN_US = 1200;

    // Implemented once per platform in win32.cpp, darwin.cpp and linux.cpp.

    /** Called once when the addon loads. */
    void Start() noexcept;

    /** Returns false after throwing a permission error into `env`. */
    bool Ready(Napi::Env env);

    bool SendKey(int code, bool down) noexcept;

    /**
     * Types text. Returns false when the OS rejected the input. Sets `error`
     * when the text cannot be typed at all, which is reported as an exception.
     */
    bool SendText(const std::u16string &text, std::string &error);

    /** Moves the pointer to (x, y), or by (x, y) when `relative` is true. */
    bool MoveMouse(int x, int y, bool relative) noexcept;

    /** Presses or releases a button. `clicks` is the click count, for double clicks. */
    bool SendButton(int button, bool down, int clicks) noexcept;

    /** Scrolls by whole notches. Positive `down` scrolls down, positive `right` scrolls right. */
    bool Scroll(int down, int right) noexcept;

    /** Reads the pointer position. Returns false where the OS does not expose it. */
    bool MousePosition(int &x, int &y) noexcept;

    void PreciseSleep(int micros) noexcept;

    /** Frees native resources. Called by Cleanup() and when Node exits. */
    void Release() noexcept;
}
