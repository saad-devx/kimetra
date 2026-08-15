#include <windows.h>
#include <napi.h>
#include <string>
#include <vector>

#ifndef CREATE_WAITABLE_TIMER_HIGH_RESOLUTION
#define CREATE_WAITABLE_TIMER_HIGH_RESOLUTION 0x00000002
#endif

// Named rather than anonymous so that `Sleep` cannot collide with the global
// Sleep() declared by windows.h when Init refers to it.
namespace kimetra
{
    enum Op
    {
        OP_DOWN = 0,
        OP_UP = 1,
        OP_SLEEP = 2,
        OP_TEXT = 3
    };

    // Spin margin: the coarse timer is left this far short of the deadline and the
    // remainder is busy-waited. Keeps the wait accurate without burning a core.
    constexpr int SPIN_MARGIN_US = 1200;

    LARGE_INTEGER g_freq = {0};
    HANDLE g_timer = nullptr;

    HANDLE EnsureTimer() noexcept
    {
        if (!g_timer)
        {
            g_timer = CreateWaitableTimerExW(nullptr, nullptr,
                                             CREATE_WAITABLE_TIMER_HIGH_RESOLUTION,
                                             TIMER_ALL_ACCESS);
            if (!g_timer)
            {
                g_timer = CreateWaitableTimerExW(nullptr, nullptr, 0, TIMER_ALL_ACCESS);
            }
        }
        return g_timer;
    }

    void InitTiming() noexcept
    {
        QueryPerformanceFrequency(&g_freq);
        EnsureTimer();
    }

    // Keys that must carry KEYEVENTF_EXTENDEDKEY for apps reading raw input.
    bool IsExtended(WORD vk) noexcept
    {
        switch (vk)
        {
        case VK_RMENU: case VK_RCONTROL: case VK_INSERT: case VK_DELETE:
        case VK_HOME: case VK_END: case VK_PRIOR: case VK_NEXT:
        case VK_LEFT: case VK_RIGHT: case VK_UP: case VK_DOWN:
        case VK_NUMLOCK: case VK_DIVIDE: case VK_LWIN: case VK_RWIN:
        case VK_APPS: case VK_SNAPSHOT:
            return true;
        default:
            return vk >= 0xA6 && vk <= 0xB7; // browser and media keys
        }
    }

    bool SendKey(int keycode, bool isDown) noexcept
    {
        WORD vk = static_cast<WORD>(keycode);

        INPUT input = {};
        input.type = INPUT_KEYBOARD;
        input.ki.wVk = vk;
        input.ki.wScan = static_cast<WORD>(MapVirtualKeyW(vk, MAPVK_VK_TO_VSC));
        input.ki.dwFlags = (isDown ? 0 : KEYEVENTF_KEYUP) |
                           (IsExtended(vk) ? KEYEVENTF_EXTENDEDKEY : 0);

        return SendInput(1, &input, sizeof(INPUT)) == 1;
    }

    void PreciseSleep(int micros) noexcept
    {
        if (micros < 1)
            return;

        LARGE_INTEGER start;
        QueryPerformanceCounter(&start);
        LONGLONG deadline = start.QuadPart + (g_freq.QuadPart * micros) / 1000000LL;

        if (micros > SPIN_MARGIN_US)
        {
            HANDLE timer = EnsureTimer();
            LARGE_INTEGER due;
            due.QuadPart = -(static_cast<LONGLONG>(micros - SPIN_MARGIN_US) * 10);
            if (timer && SetWaitableTimer(timer, &due, 0, nullptr, nullptr, FALSE))
            {
                WaitForSingleObject(timer, INFINITE);
            }
        }

        LARGE_INTEGER now;
        do
        {
            QueryPerformanceCounter(&now);
        } while (now.QuadPart < deadline);
    }

    // Unicode injection, with newline and tab sent as real key events so that
    // typed text behaves the same way on every platform.
    bool SendText(const std::u16string &text) noexcept
    {
        if (text.empty())
            return true;

        std::vector<INPUT> inputs;
        inputs.reserve(text.size() * 2);

        for (char16_t ch : text)
        {
            INPUT down = {};
            down.type = INPUT_KEYBOARD;

            if (ch == u'\n' || ch == u'\r' || ch == u'\t')
            {
                WORD vk = (ch == u'\t') ? VK_TAB : VK_RETURN;
                down.ki.wVk = vk;
                down.ki.wScan = static_cast<WORD>(MapVirtualKeyW(vk, MAPVK_VK_TO_VSC));
                down.ki.dwFlags = 0;
            }
            else
            {
                down.ki.wScan = static_cast<WORD>(ch);
                down.ki.dwFlags = KEYEVENTF_UNICODE;
            }

            INPUT up = down;
            up.ki.dwFlags |= KEYEVENTF_KEYUP;

            inputs.push_back(down);
            inputs.push_back(up);
        }

        UINT sent = SendInput(static_cast<UINT>(inputs.size()), inputs.data(), sizeof(INPUT));
        return sent == inputs.size();
    }

    Napi::Value KeyDown(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() == 0 || !info[0].IsNumber())
            return Napi::Boolean::New(env, false);

        return Napi::Boolean::New(env, SendKey(info[0].As<Napi::Number>().Int32Value(), true));
    }

    Napi::Value KeyUp(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() == 0 || !info[0].IsNumber())
            return Napi::Boolean::New(env, false);

        return Napi::Boolean::New(env, SendKey(info[0].As<Napi::Number>().Int32Value(), false));
    }

    Napi::Value SendString(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() == 0 || !info[0].IsString())
            return Napi::Boolean::New(env, false);

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

    void Release() noexcept
    {
        if (g_timer)
        {
            CloseHandle(g_timer);
            g_timer = nullptr;
        }
    }

    Napi::Value Cleanup(const Napi::CallbackInfo &info)
    {
        Release();
        return info.Env().Undefined();
    }
}

static Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    kimetra::InitTiming();

    exports.Set("KeyDown", Napi::Function::New(env, kimetra::KeyDown));
    exports.Set("KeyUp", Napi::Function::New(env, kimetra::KeyUp));
    exports.Set("SendString", Napi::Function::New(env, kimetra::SendString));
    exports.Set("Sleep", Napi::Function::New(env, kimetra::Sleep));
    exports.Set("Run", Napi::Function::New(env, kimetra::Run));
    exports.Set("Cleanup", Napi::Function::New(env, kimetra::Cleanup));

    env.AddCleanupHook([]() { kimetra::Release(); });

    return exports;
}

NODE_API_MODULE(keyboard_windows, Init)
