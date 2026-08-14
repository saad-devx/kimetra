#include <napi.h>
#include <mach/mach_time.h>
#include <ApplicationServices/ApplicationServices.h>
#include <CoreGraphics/CoreGraphics.h>

#include <string>
#include <vector>

namespace
{
    enum Op
    {
        OP_DOWN = 0,
        OP_UP = 1,
        OP_SLEEP = 2,
        OP_TEXT = 3
    };

    // Spin margin: the coarse wait stops this far short of the deadline and the
    // remainder is busy-waited. Keeps the wait accurate without burning a core.
    constexpr int SPIN_MARGIN_US = 1200;

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
    CGEventFlags g_flags = 0;

    bool EnsureTrusted() noexcept
    {
        if (!g_trusted)
            g_trusted = AXIsProcessTrusted();
        return g_trusted;
    }

    CGEventFlags FlagFor(int keycode) noexcept
    {
        switch (keycode)
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

    // macOS does not derive modifier state from separately posted key events, so the
    // held modifiers are tracked and stamped onto every event in the batch.
    bool SendKey(int keycode, bool isDown) noexcept
    {
        CGEventFlags flag = FlagFor(keycode);
        if (flag)
        {
            if (isDown)
                g_flags |= flag;
            else
                g_flags &= ~flag;
        }

        CGEventRef event = CGEventCreateKeyboardEvent(nullptr,
                                                      static_cast<CGKeyCode>(keycode),
                                                      isDown);
        if (!event)
            return false;

        if (g_flags)
            CGEventSetFlags(event, g_flags);

        CGEventPost(kCGHIDEventTap, event);
        CFRelease(event);
        return true;
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

    bool SendText(const std::u16string &text) noexcept
    {
        std::vector<UniChar> chunk;
        chunk.reserve(TEXT_CHUNK + 1);
        bool ok = true;

        for (char16_t ch : text)
        {
            if (ch == u'\r')
                continue;

            // Newline and tab go through as real key events so typed text behaves
            // the same way on every platform.
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

    bool RejectUntrusted(Napi::Env env)
    {
        if (EnsureTrusted())
            return false;

        Napi::Error::New(env, PERMISSION_HINT).ThrowAsJavaScriptException();
        return true;
    }

    Napi::Value KeyDown(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() == 0 || !info[0].IsNumber())
            return Napi::Boolean::New(env, false);
        if (RejectUntrusted(env))
            return env.Undefined();

        return Napi::Boolean::New(env, SendKey(info[0].As<Napi::Number>().Int32Value(), true));
    }

    Napi::Value KeyUp(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() == 0 || !info[0].IsNumber())
            return Napi::Boolean::New(env, false);
        if (RejectUntrusted(env))
            return env.Undefined();

        return Napi::Boolean::New(env, SendKey(info[0].As<Napi::Number>().Int32Value(), false));
    }

    Napi::Value SendString(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() == 0 || !info[0].IsString())
            return Napi::Boolean::New(env, false);
        if (RejectUntrusted(env))
            return env.Undefined();

        return Napi::Boolean::New(env, SendText(info[0].As<Napi::String>().Utf16Value()));
    }

    Napi::Value Sleep(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() > 0 && info[0].IsNumber())
        {
            PreciseSleep(info[0].As<Napi::Number>().Int32Value());
        }
        return env.Undefined();
    }

    // Executes a whole action batch without returning to JS between events.
    // ops is a flat [opcode, argument] Int32Array; text arguments index into strings.
    Napi::Value Run(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 2 || !info[0].IsTypedArray() || !info[1].IsNumber())
            return Napi::Boolean::New(env, false);
        if (RejectUntrusted(env))
            return env.Undefined();

        Napi::Int32Array ops = info[0].As<Napi::Int32Array>();
        const int32_t *data = ops.Data();
        uint32_t count = info[1].As<Napi::Number>().Uint32Value();
        if (count > ops.ElementLength())
            count = static_cast<uint32_t>(ops.ElementLength());

        bool hasStrings = info.Length() > 2 && info[2].IsArray();
        Napi::Array strings;
        if (hasStrings)
            strings = info[2].As<Napi::Array>();

        bool ok = true;

        for (uint32_t i = 0; i + 1 < count; i += 2)
        {
            const int32_t arg = data[i + 1];

            switch (data[i])
            {
            case OP_DOWN:
                ok = SendKey(arg, true) && ok;
                break;
            case OP_UP:
                ok = SendKey(arg, false) && ok;
                break;
            case OP_SLEEP:
                PreciseSleep(arg);
                break;
            case OP_TEXT:
                if (hasStrings)
                {
                    Napi::Value item = strings.Get(static_cast<uint32_t>(arg));
                    if (item.IsString())
                        ok = SendText(item.As<Napi::String>().Utf16Value()) && ok;
                }
                break;
            default:
                break;
            }
        }

        return Napi::Boolean::New(env, ok);
    }

    Napi::Value Cleanup(const Napi::CallbackInfo &info)
    {
        g_flags = 0;
        return info.Env().Undefined();
    }
}

static Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("KeyDown", Napi::Function::New(env, KeyDown));
    exports.Set("KeyUp", Napi::Function::New(env, KeyUp));
    exports.Set("SendString", Napi::Function::New(env, SendString));
    exports.Set("Sleep", Napi::Function::New(env, Sleep));
    exports.Set("Run", Napi::Function::New(env, Run));
    exports.Set("Cleanup", Napi::Function::New(env, Cleanup));

    env.AddCleanupHook([]() { g_flags = 0; });

    return exports;
}

NODE_API_MODULE(keyboard_macos, Init)
