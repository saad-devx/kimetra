#include <mach/mach_time.h>
#include <ApplicationServices/ApplicationServices.h>
#include <CoreGraphics/CoreGraphics.h>
#include <cmath>
#include <vector>

#include "backend.h"

namespace
{
    // Long unicode strings are unreliable, so text is posted in chunks.
    constexpr size_t TEXT_CHUNK = 20;

    constexpr int KEY_RETURN = 0x24;
    constexpr int KEY_TAB = 0x30;

    const char *PERMISSION_HINT =
        "Kimetra needs Accessibility permission on macOS. Open System Settings > "
        "Privacy & Security > Accessibility and enable the application running this "
        "process (Terminal, iTerm, VS Code, or your packaged app). If it is already "
        "listed, remove it, add it again, then restart the process.";

    bool g_trusted = false;

    // Held modifiers, stamped on every event; macOS doesn't derive them itself.
    CGEventFlags g_flags = 0;

    // Held mouse buttons, so moves are posted as drags while one is down.
    unsigned g_buttons = 0;

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

    bool Location(CGPoint &point) noexcept
    {
        CGEventRef event = CGEventCreate(nullptr);
        if (!event)
            return false;
        point = CGEventGetLocation(event);
        CFRelease(event);
        return true;
    }

    // Button numbers in backend.h match CGMouseButton: 0 left, 1 right, 2 centre, 3 and 4 other.
    bool PostMouse(CGEventType type, CGPoint point, int button, int clicks, int dx, int dy) noexcept
    {
        CGEventRef event = CGEventCreateMouseEvent(nullptr, type, point, static_cast<CGMouseButton>(button));
        if (!event)
            return false;

        if (clicks > 0)
            CGEventSetIntegerValueField(event, kCGMouseEventClickState, clicks);
        if (dx || dy)
        {
            CGEventSetIntegerValueField(event, kCGMouseEventDeltaX, dx);
            CGEventSetIntegerValueField(event, kCGMouseEventDeltaY, dy);
        }
        if (g_flags)
            CGEventSetFlags(event, g_flags);

        CGEventPost(kCGHIDEventTap, event);
        CFRelease(event);
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

    // Newline and tab are real key presses; carriage returns are dropped.
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

    // Coordinates are points in the global display space, origin at the top left of
    // the main display.
    bool MoveMouse(int x, int y, bool relative) noexcept
    {
        CGPoint from;
        if (!Location(from))
            return false;
        CGPoint to = relative ? CGPointMake(from.x + x, from.y + y) : CGPointMake(x, y);

        CGEventType type = kCGEventMouseMoved;
        int button = BUTTON_LEFT;
        if (g_buttons & (1u << BUTTON_LEFT))
        {
            type = kCGEventLeftMouseDragged;
        }
        else if (g_buttons & (1u << BUTTON_RIGHT))
        {
            type = kCGEventRightMouseDragged;
            button = BUTTON_RIGHT;
        }
        else if (g_buttons)
        {
            type = kCGEventOtherMouseDragged;
            button = BUTTON_MIDDLE;
            while (!(g_buttons & (1u << button)))
                button++;
        }

        return PostMouse(type, to, button, 0,
                         static_cast<int>(std::lround(to.x - from.x)),
                         static_cast<int>(std::lround(to.y - from.y)));
    }

    // macOS does not infer double clicks for posted events, so the count is set on each one.
    bool SendButton(int button, bool down, int clicks) noexcept
    {
        CGEventType type;
        switch (button)
        {
        case BUTTON_LEFT:
            type = down ? kCGEventLeftMouseDown : kCGEventLeftMouseUp;
            break;
        case BUTTON_RIGHT:
            type = down ? kCGEventRightMouseDown : kCGEventRightMouseUp;
            break;
        case BUTTON_MIDDLE:
        case BUTTON_BACK:
        case BUTTON_FORWARD:
            type = down ? kCGEventOtherMouseDown : kCGEventOtherMouseUp;
            break;
        default:
            return false;
        }

        CGPoint at;
        if (!Location(at))
            return false;

        unsigned bit = 1u << button;
        g_buttons = down ? (g_buttons | bit) : (g_buttons & ~bit);
        return PostMouse(type, at, button, clicks, 0, 0);
    }

    // macOS counts positive scroll as up and left, the opposite of `down` and `right`.
    bool Scroll(int down, int right) noexcept
    {
        CGEventRef event = CGEventCreateScrollWheelEvent(nullptr, kCGScrollEventUnitLine, 2, -down, -right);
        if (!event)
            return false;
        if (g_flags)
            CGEventSetFlags(event, g_flags);
        CGEventPost(kCGHIDEventTap, event);
        CFRelease(event);
        return true;
    }

    bool MousePosition(int &x, int &y) noexcept
    {
        CGPoint point;
        if (!Location(point))
            return false;
        x = static_cast<int>(std::lround(point.x));
        y = static_cast<int>(std::lround(point.y));
        return true;
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
        g_buttons = 0;
    }
}
