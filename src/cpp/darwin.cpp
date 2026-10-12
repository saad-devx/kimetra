#include <mach/mach_time.h>
#include <ApplicationServices/ApplicationServices.h>
#include <CoreGraphics/CoreGraphics.h>
#include <vector>

#include "backend.h"

namespace
{
    // CGEventKeyboardSetUnicodeString is unreliable for long strings, so text is
    // posted in small chunks.
    constexpr size_t TEXT_CHUNK = 20;

    constexpr int KEY_RETURN = 0x24;
    constexpr int KEY_TAB = 0x30;

    const char *PERMISSION_HINT =
        "Kimetra needs Accessibility permission on macOS. Open System Settings > "
        "Privacy & Security > Accessibility and enable the application running this "
        "process (Terminal, iTerm, VS Code, or your packaged app). If it is already "
        "listed, remove it, add it again, then restart the process.";

    bool g_trusted = false;

    // macOS does not derive modifier state from separately posted key events, so the
    // held modifiers are tracked and stamped onto every event in the batch.
    CGEventFlags g_flags = 0;

    CGEventFlags FlagFor(int code) noexcept
    {
        switch (code)
        {
        case 0x38: case 0x3C:
            return kCGEventFlagMaskShift;
        case 0x3B: case 0x3E:
            return kCGEventFlagMaskControl;
        case 0x3A: case 0x3D:
            return kCGEventFlagMaskAlternate;
        case 0x37: case 0x36:
            return kCGEventFlagMaskCommand;
        default:
            return 0;
        }
    }

    bool PostUnicode(const UniChar *chars, size_t length) noexcept
    {
        CGEventRef down = CGEventCreateKeyboardEvent(nullptr, 0, true);
        if (!down)
            return false;
        CGEventKeyboardSetUnicodeString(down, length, chars);
        if (g_flags)
            CGEventSetFlags(down, g_flags);
        CGEventPost(kCGHIDEventTap, down);
        CFRelease(down);

        CGEventRef up = CGEventCreateKeyboardEvent(nullptr, 0, false);
        if (!up)
            return false;
        CGEventKeyboardSetUnicodeString(up, length, chars);
        CGEventPost(kCGHIDEventTap, up);
        CFRelease(up);

        return true;
    }
}

namespace kimetra
{
    void Start() noexcept {}

    bool Ready(Napi::Env env)
    {
        if (!g_trusted)
            g_trusted = AXIsProcessTrusted();
        if (g_trusted)
            return true;

        Napi::Error::New(env, PERMISSION_HINT).ThrowAsJavaScriptException();
        return false;
    }

    bool SendKey(int code, bool down) noexcept
    {
        CGEventFlags flag = FlagFor(code);
        if (flag)
            g_flags = down ? (g_flags | flag) : (g_flags & ~flag);

        CGEventRef event = CGEventCreateKeyboardEvent(nullptr, static_cast<CGKeyCode>(code), down);
        if (!event)
            return false;

        if (g_flags)
            CGEventSetFlags(event, g_flags);

        CGEventPost(kCGHIDEventTap, event);
        CFRelease(event);
        return true;
    }

    // Newline and tab are sent as real key presses and carriage returns are
    // dropped, matching Windows and Linux.
    bool SendText(const std::u16string &text, std::string &)
    {
        std::vector<UniChar> chunk;
        chunk.reserve(TEXT_CHUNK + 1);
        bool ok = true;

        for (char16_t ch : text)
        {
            if (ch == u'\r')
                continue;

            if (ch == u'\n' || ch == u'\t')
            {
                if (!chunk.empty())
                {
                    ok = PostUnicode(chunk.data(), chunk.size()) && ok;
                    chunk.clear();
                }
                int code = (ch == u'\t') ? KEY_TAB : KEY_RETURN;
                ok = SendKey(code, true) && ok;
                ok = SendKey(code, false) && ok;
                continue;
            }

            chunk.push_back(static_cast<UniChar>(ch));

            // Never split a surrogate pair across two events.
            bool highSurrogate = ch >= 0xD800 && ch <= 0xDBFF;
            if (chunk.size() >= TEXT_CHUNK && !highSurrogate)
            {
                ok = PostUnicode(chunk.data(), chunk.size()) && ok;
                chunk.clear();
            }
        }

        if (!chunk.empty())
            ok = PostUnicode(chunk.data(), chunk.size()) && ok;

        return ok;
    }

    void PreciseSleep(int micros) noexcept
    {
        if (micros < 1)
            return;

        static mach_timebase_info_data_t timebase;
        if (timebase.denom == 0)
            mach_timebase_info(&timebase);

        uint64_t ticks = (static_cast<uint64_t>(micros) * 1000ULL) * timebase.denom / timebase.numer;
        uint64_t deadline = mach_absolute_time() + ticks;

        if (micros > SPIN_MARGIN_US)
        {
            uint64_t margin = (static_cast<uint64_t>(SPIN_MARGIN_US) * 1000ULL) *
                              timebase.denom / timebase.numer;
            mach_wait_until(deadline - margin);
        }

        while (mach_absolute_time() < deadline)
            ;
    }

    void Release() noexcept
    {
        g_flags = 0;
    }
}
