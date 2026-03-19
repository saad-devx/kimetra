#include <napi.h>
#include <unistd.h>
#include <mach/mach_time.h>
#include <time.h>
#include <CoreGraphics/CoreGraphics.h>
#include <vector>

class KeyboardMacOS
{
private:
    static inline bool SendKey(int keycode, bool isDown)
    {
        CGEventRef event = CGEventCreateKeyboardEvent(NULL, keycode, isDown);
        if (!event)
            return false;
        CGEventPost(kCGHIDEventTap, event);
        CFRelease(event);
        return true;
    }

public:
    static Napi::Value KeyDown(const Napi::CallbackInfo &info)
    {
        return Napi::Boolean::New(info.Env(),
                                  info.Length() > 0 && info[0].IsNumber() &&
                                      SendKey(info[0].As<Napi::Number>().Int32Value(), true));
    }

    static Napi::Value KeyUp(const Napi::CallbackInfo &info)
    {
        return Napi::Boolean::New(info.Env(),
                                  info.Length() > 0 && info[0].IsNumber() &&
                                      SendKey(info[0].As<Napi::Number>().Int32Value(), false));
    }

    static Napi::Value SendString(const Napi::CallbackInfo &info)
    {
        if (info.Length() == 0 || !info[0].IsString())
        {
            return Napi::Boolean::New(info.Env(), false);
        }

        auto utf16 = info[0].As<Napi::String>().Utf16Value();
        if (utf16.empty())
            return Napi::Boolean::New(info.Env(), true);

        std::vector<UniChar> chars(utf16.begin(), utf16.end());

        CGEventRef event = CGEventCreateKeyboardEvent(NULL, 0, true);
        if (!event)
            return Napi::Boolean::New(info.Env(), false);

        CGEventKeyboardSetUnicodeString(event, chars.size(), chars.data());
        CGEventPost(kCGHIDEventTap, event);
        CFRelease(event);

        return Napi::Boolean::New(info.Env(), true);
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

        static mach_timebase_info_data_t timebase;
        if (timebase.denom == 0)
        {
            mach_timebase_info(&timebase);
        }

        if (micros <= BUSY_WAIT_THRESHOLD)
        {
            uint64_t start = mach_absolute_time();
            uint64_t wait_ns = static_cast<uint64_t>(micros) * 1000;
            uint64_t wait_ticks = wait_ns * timebase.denom / timebase.numer;

            while ((mach_absolute_time() - start) < wait_ticks)
                ;
        }
        else
        {
            int sleepMicros = micros - BUSY_WAIT_THRESHOLD;
            struct timespec req = {
                .tv_sec = sleepMicros / 1'000'000,
                .tv_nsec = (sleepMicros % 1'000'000) * 1000};
            nanosleep(&req, nullptr);

            uint64_t start = mach_absolute_time();
            uint64_t wait_ns = static_cast<uint64_t>(BUSY_WAIT_THRESHOLD) * 1000;
            uint64_t wait_ticks = wait_ns * timebase.denom / timebase.numer;

            while ((mach_absolute_time() - start) < wait_ticks)
                ;
        }

        return env.Undefined();
    }
};

static Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("KeyDown", Napi::Function::New(env, KeyboardMacOS::KeyDown));
    exports.Set("KeyUp", Napi::Function::New(env, KeyboardMacOS::KeyUp));
    exports.Set("SendString", Napi::Function::New(env, KeyboardMacOS::SendString));
    exports.Set("Sleep", Napi::Function::New(env, KeyboardMacOS::Sleep));
    return exports;
}

NODE_API_MODULE(keyboard_macos, Init)