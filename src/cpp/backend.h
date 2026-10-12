#pragma once

#include <napi.h>
#include <string>

namespace kimetra
{
    // Batch layout, mirrored in src/kimetra.js. Each op is three int32 slots:
    // [op, a, b]. Raise BATCH_FORMAT whenever the layout changes.
    constexpr int BATCH_FORMAT = 2;

    enum Op
    {
        OP_DOWN = 0,
        OP_UP = 1,
        OP_SLEEP = 2,
        OP_TEXT = 3,
        // Reserved for mouse support.
        OP_MOVE = 4,
        OP_BUTTON_DOWN = 5,
        OP_BUTTON_UP = 6,
        OP_SCROLL = 7
    };

    // Waits stop this far short of the deadline and busy-wait the rest, which
    // keeps them accurate without burning a core.
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

    void PreciseSleep(int micros) noexcept;

    /** Frees native resources. Called by Cleanup() and when Node exits. */
    void Release() noexcept;
}
