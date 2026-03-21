#include <napi.h>
#include <unistd.h>
#include <fcntl.h>
#include <string.h>
#include <linux/uinput.h>
#include <linux/input.h>
#include <vector>
#include <time.h>
#include <unordered_set>
#include <unordered_map>

class KeyboardLinux
{
private:
    static int ufd;

    static inline int GetDevice()
    {
        if (ufd >= 0)
            return ufd;

        ufd = open("/dev/uinput", O_WRONLY | O_NONBLOCK);
        if (ufd < 0)
            return -1;

        ioctl(ufd, UI_SET_EVBIT, EV_KEY);
        ioctl(ufd, UI_SET_EVBIT, EV_SYN);

        for (int i = KEY_ESC; i <= KEY_KPDOT; i++)
            ioctl(ufd, UI_SET_KEYBIT, i);
        ioctl(ufd, UI_SET_KEYBIT, KEY_LEFTSHIFT);

        struct uinput_setup usetup = {};
        usetup.id.bustype = BUS_USB;
        usetup.id.vendor  = 0x1234;
        usetup.id.product = 0x5678;
        strncpy(usetup.name, "kimetra-virtual-keyboard", UINPUT_MAX_NAME_SIZE);

        if (ioctl(ufd, UI_DEV_SETUP, &usetup) < 0 ||
            ioctl(ufd, UI_DEV_CREATE) < 0)
        {
            close(ufd);
            ufd = -1;
            return -1;
        }

        usleep(50000);
        return ufd;
    }

    static inline bool Emit(int fd, int type, int code, int value)
    {
        struct input_event ev = {};
        ev.type  = type;
        ev.code  = code;
        ev.value = value;
        return write(fd, &ev, sizeof(ev)) == sizeof(ev);
    }

    static inline bool SendKey(int keycode, bool isDown)
    {
        int fd = GetDevice();
        if (fd < 0)
            return false;
        return Emit(fd, EV_KEY, keycode, isDown ? 1 : 0) &&
               Emit(fd, EV_SYN, SYN_REPORT, 0);
    }

    static inline bool RequiresShift(char16_t ch)
    {
        if (ch >= 'A' && ch <= 'Z')
            return true;

        static const std::unordered_set<char16_t> shiftChars = {
            '!', '@', '#', '$', '%', '^', '&', '*', '(', ')',
            '_', '+', '{', '}', '|', ':', '"', '<', '>', '?', '~'};

        return shiftChars.find(ch) != shiftChars.end();
    }

    static inline int GetKeyCode(char16_t ch)
    {
        static const std::unordered_map<char16_t, int> controlKeys = {
            {'\n', KEY_ENTER},
            {'\t', KEY_TAB},
            {'\b', KEY_BACKSPACE},
            {' ',  KEY_SPACE}};

        static const std::unordered_map<char16_t, int> shiftKeyAlts = {
            {'!', KEY_1},         {'@', KEY_2},         {'#', KEY_3},
            {'$', KEY_4},         {'%', KEY_5},         {'^', KEY_6},
            {'&', KEY_7},         {'*', KEY_8},         {'(', KEY_9},
            {')', KEY_0},         {'_', KEY_MINUS},      {'+', KEY_EQUAL},
            {'{', KEY_LEFTBRACE}, {'}', KEY_RIGHTBRACE}, {'|', KEY_BACKSLASH},
            {':', KEY_SEMICOLON}, {'"', KEY_APOSTROPHE}, {'<', KEY_COMMA},
            {'>', KEY_DOT},       {'?', KEY_SLASH},      {'~', KEY_GRAVE}};

        static const std::unordered_map<char16_t, int> plainKeys = {
            {'a', KEY_A}, {'b', KEY_B}, {'c', KEY_C}, {'d', KEY_D}, {'e', KEY_E},
            {'f', KEY_F}, {'g', KEY_G}, {'h', KEY_H}, {'i', KEY_I}, {'j', KEY_J},
            {'k', KEY_K}, {'l', KEY_L}, {'m', KEY_M}, {'n', KEY_N}, {'o', KEY_O},
            {'p', KEY_P}, {'q', KEY_Q}, {'r', KEY_R}, {'s', KEY_S}, {'t', KEY_T},
            {'u', KEY_U}, {'v', KEY_V}, {'w', KEY_W}, {'x', KEY_X}, {'y', KEY_Y},
            {'z', KEY_Z},
            {'0', KEY_0}, {'1', KEY_1}, {'2', KEY_2}, {'3', KEY_3}, {'4', KEY_4},
            {'5', KEY_5}, {'6', KEY_6}, {'7', KEY_7}, {'8', KEY_8}, {'9', KEY_9},
            {'-', KEY_MINUS},      {'=', KEY_EQUAL},      {'[', KEY_LEFTBRACE},
            {']', KEY_RIGHTBRACE}, {'\\', KEY_BACKSLASH}, {';', KEY_SEMICOLON},
            {'\'', KEY_APOSTROPHE},{',', KEY_COMMA},       {'.', KEY_DOT},
            {'/', KEY_SLASH},      {'`', KEY_GRAVE}};

        auto it = controlKeys.find(ch);
        if (it != controlKeys.end())
            return it->second;

        if (ch >= 'A' && ch <= 'Z')
        {
            auto lit = plainKeys.find((char16_t)(ch - 'A' + 'a'));
            return lit != plainKeys.end() ? lit->second : -1;
        }

        it = shiftKeyAlts.find(ch);
        if (it != shiftKeyAlts.end())
            return it->second;

        it = plainKeys.find(ch);
        if (it != plainKeys.end())
            return it->second;

        return -1;
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

        int fd = GetDevice();
        if (fd < 0)
        {
            Napi::Error::New(env,
                "Cannot open /dev/uinput. Grant access via: "
                "sudo chmod 0660 /dev/uinput, or add a udev rule: "
                "KERNEL==\"uinput\", GROUP=\"input\", MODE=\"0660\"")
                .ThrowAsJavaScriptException();
            return Napi::Boolean::New(env, false);
        }

        bool success = true;

        for (char16_t ch : utf16)
        {
            int keycode = GetKeyCode(ch);
            if (keycode < 0)
                continue;

            bool needShift = RequiresShift(ch);

            if (needShift)
                if (!Emit(fd, EV_KEY, KEY_LEFTSHIFT, 1) || !Emit(fd, EV_SYN, SYN_REPORT, 0))
                    { success = false; break; }

            if (!Emit(fd, EV_KEY, keycode, 1) || !Emit(fd, EV_SYN, SYN_REPORT, 0) ||
                !Emit(fd, EV_KEY, keycode, 0) || !Emit(fd, EV_SYN, SYN_REPORT, 0))
            {
                if (needShift)
                {
                    Emit(fd, EV_KEY, KEY_LEFTSHIFT, 0);
                    Emit(fd, EV_SYN, SYN_REPORT, 0);
                }
                success = false;
                break;
            }

            if (needShift)
                if (!Emit(fd, EV_KEY, KEY_LEFTSHIFT, 0) || !Emit(fd, EV_SYN, SYN_REPORT, 0))
                    { success = false; break; }
        }

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

        constexpr int BUSY_WAIT_THRESHOLD = 100000;
        if (micros <= BUSY_WAIT_THRESHOLD)
        {
            struct timespec start, now;
            clock_gettime(CLOCK_MONOTONIC, &start);
            long long target = start.tv_sec * 1'000'000LL + start.tv_nsec / 1000 + micros;
            do {
                clock_gettime(CLOCK_MONOTONIC, &now);
                if (now.tv_sec * 1'000'000LL + now.tv_nsec / 1000 >= target) break;
            } while (true);
        }
        else
        {
            int sleepMicros = micros - BUSY_WAIT_THRESHOLD;
            struct timespec req = {
                .tv_sec  = sleepMicros / 1'000'000,
                .tv_nsec = (sleepMicros % 1'000'000) * 1000};
            nanosleep(&req, nullptr);

            struct timespec start, now;
            clock_gettime(CLOCK_MONOTONIC, &start);
            long long target = start.tv_sec * 1'000'000LL + start.tv_nsec / 1000 + BUSY_WAIT_THRESHOLD;
            do {
                clock_gettime(CLOCK_MONOTONIC, &now);
                if (now.tv_sec * 1'000'000LL + now.tv_nsec / 1000 >= target) break;
            } while (true);
        }

        return env.Undefined();
    }

    static void Cleanup()
    {
        if (ufd >= 0)
        {
            ioctl(ufd, UI_DEV_DESTROY);
            close(ufd);
            ufd = -1;
        }
    }
};

int KeyboardLinux::ufd = -1;

static Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set("KeyDown",    Napi::Function::New(env, KeyboardLinux::KeyDown));
    exports.Set("KeyUp",      Napi::Function::New(env, KeyboardLinux::KeyUp));
    exports.Set("SendString", Napi::Function::New(env, KeyboardLinux::SendString));
    exports.Set("Sleep",      Napi::Function::New(env, KeyboardLinux::Sleep));

    env.AddCleanupHook([]() { KeyboardLinux::Cleanup(); });

    return exports;
}

NODE_API_MODULE(keyboard_linux, Init)