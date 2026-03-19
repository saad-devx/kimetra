#include <napi.h>
#include <unistd.h>
#include <X11/Xlib.h>
#include <X11/extensions/XTest.h>
#include <X11/keysym.h>
#include <vector>
#include <time.h>
#include <unordered_set>
#include <unordered_map>

class KeyboardLinux
{
private:
    static Display *display;

    static inline Display *GetDisplay()
    {
        if (!display)
            display = XOpenDisplay(NULL);
        return display;
    }

    static inline bool SendKey(int keycode, bool isDown)
    {
        Display *d = GetDisplay();
        if (!d)
            return false;
        int result = XTestFakeKeyEvent(d, keycode, isDown, 0);
        XFlush(d);
        return result == 1;
    }

    static inline bool RequiresShift(char16_t ch)
    {
        if (ch >= 'A' && ch <= 'Z')
            return true;

        static const std::unordered_set<char16_t> shiftChars = {
            '!', '@', '#', '$', '%', '^', '&', '*', '(', ')',
            '_', '+', '{', '}', '|', ':', '"', '<', '>', '?'};

        return shiftChars.find(ch) != shiftChars.end();
    }

    static inline KeySym GetKeySym(char16_t ch)
    {
        static const std::unordered_map<char16_t, KeySym> controlKeys = {
            {'\n', XK_Return},
            {'\t', XK_Tab},
            {'\b', XK_BackSpace},
            {' ', XK_space}};

        static const std::unordered_map<char16_t, KeySym> shiftKeyAlts = {
            {'!', XK_1}, {'@', XK_2}, {'#', XK_3}, {'$', XK_4}, {'%', XK_5}, {'^', XK_6}, {'&', XK_7}, {'*', XK_8}, {'(', XK_9}, {')', XK_0}, {'_', XK_minus}, {'+', XK_equal}, {'{', XK_bracketleft}, {'}', XK_bracketright}, {'|', XK_backslash}, {':', XK_semicolon}, {'"', XK_apostrophe}, {'<', XK_comma}, {'>', XK_period}, {'?', XK_slash}};

        auto controlIt = controlKeys.find(ch);
        if (controlIt != controlKeys.end())
            return controlIt->second;

        if (ch >= 'A' && ch <= 'Z')
            return (KeySym)(ch - 'A' + 'a');

        auto shiftIt = shiftKeyAlts.find(ch);
        if (shiftIt != shiftKeyAlts.end())
            return shiftIt->second;

        return (ch < 128) ? (KeySym)ch : (KeySym)ch;
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
            return Napi::Boolean::New(env, false);

        auto utf16 = info[0].As<Napi::String>().Utf16Value();
        if (utf16.empty())
            return Napi::Boolean::New(env, true);

        Display *d = GetDisplay();
        if (!d)
            return Napi::Boolean::New(env, false);

        KeyCode shiftKeycode = XKeysymToKeycode(d, XK_Shift_L);
        bool success = true;

        for (char16_t ch : utf16)
        {
            KeySym keysym = GetKeySym(ch);
            KeyCode keycode = XKeysymToKeycode(d, keysym);
            if (keycode == 0)
                continue;

            bool needShift = RequiresShift(ch);

            // Press shift if needed
            if (needShift && shiftKeycode != 0)
            {
                if (XTestFakeKeyEvent(d, shiftKeycode, True, 0) != 1)
                {
                    success = false;
                    break;
                }
            }

            // Press and release the key
            if (XTestFakeKeyEvent(d, keycode, True, 0) != 1 ||
                XTestFakeKeyEvent(d, keycode, False, 0) != 1)
            {
                success = false;
                // Release shift if it was pressed before breaking
                if (needShift && shiftKeycode != 0)
                {
                    XTestFakeKeyEvent(d, shiftKeycode, False, 0);
                }
                break;
            }

            // Release shift if it was pressed
            if (needShift && shiftKeycode != 0)
            {
                if (XTestFakeKeyEvent(d, shiftKeycode, False, 0) != 1)
                {
                    success = false;
                    break;
                }
            }
        }

        XFlush(d);
        return Napi::Boolean::New(env, success);
    }

    static Napi::Value Sleep(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsNumber())
            return env.Undefined();

        int micros = info[0].As<Napi::Number>().Int32Value();
        if (micros < 1)
            return env.Undefined();

        constexpr int BUSY_WAIT_THRESHOLD = 100000; // 100 ms
        if (micros <= BUSY_WAIT_THRESHOLD)
        {
            struct timespec start, now;
            clock_gettime(CLOCK_MONOTONIC, &start);

            long long target = start.tv_sec * 1'000'000LL + start.tv_nsec / 1000 + micros;
            do
            {
                clock_gettime(CLOCK_MONOTONIC, &now);
                long long current = now.tv_sec * 1'000'000LL + now.tv_nsec / 1000;
                if (current >= target)
                    break;
            } while (true);
        }
        else
        {
            int sleepMicros = micros - BUSY_WAIT_THRESHOLD;
            struct timespec req = {
                .tv_sec = sleepMicros / 1'000'000,
                .tv_nsec = (sleepMicros % 1'000'000) * 1000};
            nanosleep(&req, nullptr);

            struct timespec start, now;
            clock_gettime(CLOCK_MONOTONIC, &start);

            long long target = start.tv_sec * 1'000'000LL + start.tv_nsec / 1000 + BUSY_WAIT_THRESHOLD;
            do
            {
                clock_gettime(CLOCK_MONOTONIC, &now);
                long long current = now.tv_sec * 1'000'000LL + now.tv_nsec / 1000;
                if (current >= target)
                    break;
            } while (true);
        }

        return env.Undefined();
    }

    static void Cleanup()
    {
        if (display)
        {
            XCloseDisplay(display);
            display = nullptr;
        }
    }
};

Display *KeyboardLinux::display = nullptr;

static Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("KeyDown", Napi::Function::New(env, KeyboardLinux::KeyDown));
    exports.Set("KeyUp", Napi::Function::New(env, KeyboardLinux::KeyUp));
    exports.Set("SendString", Napi::Function::New(env, KeyboardLinux::SendString));
    exports.Set("Sleep", Napi::Function::New(env, KeyboardLinux::Sleep));

    env.AddCleanupHook([]()
                       { KeyboardLinux::Cleanup(); });

    return exports;
}

NODE_API_MODULE(keyboard_linux, Init)