#include <windows.h>
#include <napi.h>
#include <vector>

class KeyboardWindows
{
private:
    static inline bool SendKey(int keycode, bool isDown) noexcept
    {
        INPUT input;
        input.type = INPUT_KEYBOARD;
        input.ki.wVk = static_cast<WORD>(keycode);
        input.ki.wScan = 0;
        input.ki.dwFlags = isDown ? 0 : KEYEVENTF_KEYUP;
        input.ki.time = 0;
        input.ki.dwExtraInfo = 0;

        return SendInput(1, &input, sizeof(INPUT)) == 1;
    }

    static inline LARGE_INTEGER GetFrequency() noexcept
    {
        static LARGE_INTEGER freq = {0};
        if (freq.QuadPart == 0)
        {
            QueryPerformanceFrequency(&freq);
        }
        return freq;
    }

public:
    static Napi::Value KeyDown(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() == 0 || !info[0].IsNumber())
            return Napi::Boolean::New(env, false);

        int keycode = info[0].As<Napi::Number>().Int32Value();
        return Napi::Boolean::New(env, SendKey(keycode, true));
    }

    static Napi::Value KeyUp(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() == 0 || !info[0].IsNumber())
            return Napi::Boolean::New(env, false);

        int keycode = info[0].As<Napi::Number>().Int32Value();
        return Napi::Boolean::New(env, SendKey(keycode, false));
    }

    static Napi::Value SendString(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();

        if (info.Length() == 0 || !info[0].IsString())
        {
            return Napi::Boolean::New(env, false);
        }

        auto utf16 = info[0].As<Napi::String>().Utf16Value();
        if (utf16.empty())
        {
            return Napi::Boolean::New(env, true);
        }

        std::vector<INPUT> inputs;
        inputs.reserve(utf16.size() * 2);

        for (char16_t ch : utf16)
        {
            INPUT down = {};
            down.type = INPUT_KEYBOARD;
            down.ki.wScan = ch;
            down.ki.dwFlags = KEYEVENTF_UNICODE;

            INPUT up = down;
            up.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;

            inputs.push_back(down);
            inputs.push_back(up);
        }

        UINT sent = SendInput(static_cast<UINT>(inputs.size()), inputs.data(), sizeof(INPUT));
        return Napi::Boolean::New(env, sent == inputs.size());
    }

    static Napi::Value Sleep(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsNumber())
        {
            return env.Undefined();
        }

        int micros = info[0].As<Napi::Number>().Int32Value();
        if (micros < 1)
        {
            return env.Undefined();
        }

        LARGE_INTEGER freq = GetFrequency();

        if (micros < 100000)
        {
            LARGE_INTEGER start, now;
            QueryPerformanceCounter(&start);
            LONGLONG endTicks = start.QuadPart + (freq.QuadPart * micros) / 1000000LL;

            do
            {
                QueryPerformanceCounter(&now);
            } while (now.QuadPart < endTicks);
        }
        else
        {
            int sleepMillis = (micros - 100000) / 1000;
            if (sleepMillis > 0)
            {
                ::Sleep(static_cast<DWORD>(sleepMillis));
            }

            int remainingMicros = micros - (sleepMillis * 1000);
            LARGE_INTEGER start, now;
            QueryPerformanceCounter(&start);
            LONGLONG endTicks = start.QuadPart + (freq.QuadPart * remainingMicros) / 1000000LL;

            do
            {
                QueryPerformanceCounter(&now);
            } while (now.QuadPart < endTicks);
        }

        return env.Undefined();
    }
};

static Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("KeyDown", Napi::Function::New(env, KeyboardWindows::KeyDown));
    exports.Set("KeyUp", Napi::Function::New(env, KeyboardWindows::KeyUp));
    exports.Set("SendString", Napi::Function::New(env, KeyboardWindows::SendString));
    exports.Set("Sleep", Napi::Function::New(env, KeyboardWindows::Sleep));
    return exports;
}

NODE_API_MODULE(keyboard_windows, Init)