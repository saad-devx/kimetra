#include <unistd.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include <sys/ioctl.h>
#include <linux/uinput.h>
#include <linux/input.h>
#include <unordered_map>

#include "backend.h"

namespace
{
    // Time for the compositor to enumerate the new virtual device. Paid once per
    // process; too short and the first keystroke is dropped.
    constexpr int DEVICE_SETTLE_US = 250000;

    const char *PERMISSION_HINT =
        "Kimetra cannot open /dev/uinput. Grant access with a udev rule:\n"
        "  echo 'KERNEL==\"uinput\", GROUP=\"input\", MODE=\"0660\"' | "
        "sudo tee /etc/udev/rules.d/99-kimetra.rules\n"
        "  sudo usermod -aG input $USER\n"
        "Then reboot, or run the process as root.";

    int g_fd = -1;

    int GetDevice() noexcept
    {
        if (g_fd >= 0)
            return g_fd;

        g_fd = open("/dev/uinput", O_WRONLY | O_NONBLOCK);
        if (g_fd < 0)
            return -1;

        if (ioctl(g_fd, UI_SET_EVBIT, EV_KEY) < 0 || ioctl(g_fd, UI_SET_EVBIT, EV_SYN) < 0)
        {
            close(g_fd);
            g_fd = -1;
            return -1;
        }

        // Declare the full standard key range so no mapped key is silently filtered.
        for (int key = 1; key <= 255; key++)
            ioctl(g_fd, UI_SET_KEYBIT, key);

        struct uinput_setup setup = {};
        setup.id.bustype = BUS_USB;
        setup.id.vendor = 0x1234;
        setup.id.product = 0x5678;
        strncpy(setup.name, "kimetra-virtual-keyboard", UINPUT_MAX_NAME_SIZE - 1);

        if (ioctl(g_fd, UI_DEV_SETUP, &setup) < 0 || ioctl(g_fd, UI_DEV_CREATE) < 0)
        {
            close(g_fd);
            g_fd = -1;
            return -1;
        }

        usleep(DEVICE_SETTLE_US);
        return g_fd;
    }

    bool Emit(int fd, int type, int code, int value) noexcept
    {
        struct input_event ev = {};
        ev.type = static_cast<__u16>(type);
        ev.code = static_cast<__u16>(code);
        ev.value = value;
        return write(fd, &ev, sizeof(ev)) == sizeof(ev);
    }

    // uinput emits scan codes, so typed text is limited to what a US QWERTY layout
    // can produce. Anything else is reported rather than silently dropped.
    const std::unordered_map<char16_t, int> &PlainKeys()
    {
        static const std::unordered_map<char16_t, int> map = {
            {u'a', KEY_A}, {u'b', KEY_B}, {u'c', KEY_C}, {u'd', KEY_D}, {u'e', KEY_E},
            {u'f', KEY_F}, {u'g', KEY_G}, {u'h', KEY_H}, {u'i', KEY_I}, {u'j', KEY_J},
            {u'k', KEY_K}, {u'l', KEY_L}, {u'm', KEY_M}, {u'n', KEY_N}, {u'o', KEY_O},
            {u'p', KEY_P}, {u'q', KEY_Q}, {u'r', KEY_R}, {u's', KEY_S}, {u't', KEY_T},
            {u'u', KEY_U}, {u'v', KEY_V}, {u'w', KEY_W}, {u'x', KEY_X}, {u'y', KEY_Y},
            {u'z', KEY_Z},
            {u'0', KEY_0}, {u'1', KEY_1}, {u'2', KEY_2}, {u'3', KEY_3}, {u'4', KEY_4},
            {u'5', KEY_5}, {u'6', KEY_6}, {u'7', KEY_7}, {u'8', KEY_8}, {u'9', KEY_9},
            {u'-', KEY_MINUS}, {u'=', KEY_EQUAL}, {u'[', KEY_LEFTBRACE},
            {u']', KEY_RIGHTBRACE}, {u'\\', KEY_BACKSLASH}, {u';', KEY_SEMICOLON},
            {u'\'', KEY_APOSTROPHE}, {u',', KEY_COMMA}, {u'.', KEY_DOT},
            {u'/', KEY_SLASH}, {u'`', KEY_GRAVE}, {u' ', KEY_SPACE},
            {u'\n', KEY_ENTER}, {u'\t', KEY_TAB}, {u'\b', KEY_BACKSPACE}};
        return map;
    }

    const std::unordered_map<char16_t, int> &ShiftedKeys()
    {
        static const std::unordered_map<char16_t, int> map = {
            {u'!', KEY_1}, {u'@', KEY_2}, {u'#', KEY_3}, {u'$', KEY_4},
            {u'%', KEY_5}, {u'^', KEY_6}, {u'&', KEY_7}, {u'*', KEY_8},
            {u'(', KEY_9}, {u')', KEY_0}, {u'_', KEY_MINUS}, {u'+', KEY_EQUAL},
            {u'{', KEY_LEFTBRACE}, {u'}', KEY_RIGHTBRACE}, {u'|', KEY_BACKSLASH},
            {u':', KEY_SEMICOLON}, {u'"', KEY_APOSTROPHE}, {u'<', KEY_COMMA},
            {u'>', KEY_DOT}, {u'?', KEY_SLASH}, {u'~', KEY_GRAVE}};
        return map;
    }

    // Returns the key code, sets needShift, or -1 when the character is unsupported.
    int Lookup(char16_t ch, bool &needShift) noexcept
    {
        needShift = false;

        if (ch >= u'A' && ch <= u'Z')
        {
            needShift = true;
            auto it = PlainKeys().find(static_cast<char16_t>(ch - u'A' + u'a'));
            return it != PlainKeys().end() ? it->second : -1;
        }

        auto plain = PlainKeys().find(ch);
        if (plain != PlainKeys().end())
            return plain->second;

        auto shifted = ShiftedKeys().find(ch);
        if (shifted != ShiftedKeys().end())
        {
            needShift = true;
            return shifted->second;
        }

        return -1;
    }

    std::string UnsupportedChar(char16_t ch)
    {
        char buf[192];
        snprintf(buf, sizeof(buf),
                 "Kimetra cannot type U+%04X on Linux. uinput sends scan codes, so "
                 "typeText is limited to US QWERTY printable ASCII. Use the clipboard "
                 "for other characters.",
                 static_cast<unsigned>(ch));
        return buf;
    }
}

namespace kimetra
{
    void Start() noexcept {}

    bool Ready(Napi::Env env)
    {
        if (GetDevice() >= 0)
            return true;

        Napi::Error::New(env, PERMISSION_HINT).ThrowAsJavaScriptException();
        return false;
    }

    bool SendKey(int code, bool down) noexcept
    {
        int fd = GetDevice();
        if (fd < 0)
            return false;

        return Emit(fd, EV_KEY, code, down ? 1 : 0) &&
               Emit(fd, EV_SYN, SYN_REPORT, 0);
    }

    bool SendText(const std::u16string &text, std::string &error)
    {
        int fd = GetDevice();
        if (fd < 0)
            return false;

        // Validate up front so a bad character cannot leave half the text typed.
        for (char16_t ch : text)
        {
            bool shift;
            if (ch != u'\r' && Lookup(ch, shift) < 0)
            {
                error = UnsupportedChar(ch);
                return false;
            }
        }

        for (char16_t ch : text)
        {
            if (ch == u'\r')
                continue;

            bool needShift;
            int code = Lookup(ch, needShift);

            if (needShift)
            {
                Emit(fd, EV_KEY, KEY_LEFTSHIFT, 1);
                Emit(fd, EV_SYN, SYN_REPORT, 0);
            }

            Emit(fd, EV_KEY, code, 1);
            Emit(fd, EV_SYN, SYN_REPORT, 0);
            Emit(fd, EV_KEY, code, 0);
            Emit(fd, EV_SYN, SYN_REPORT, 0);

            if (needShift)
            {
                Emit(fd, EV_KEY, KEY_LEFTSHIFT, 0);
                Emit(fd, EV_SYN, SYN_REPORT, 0);
            }
        }

        return true;
    }

    void PreciseSleep(int micros) noexcept
    {
        if (micros < 1)
            return;

        struct timespec ts;
        clock_gettime(CLOCK_MONOTONIC, &ts);

        long long deadline = static_cast<long long>(ts.tv_sec) * 1000000000LL +
                             ts.tv_nsec + static_cast<long long>(micros) * 1000LL;

        if (micros > SPIN_MARGIN_US)
        {
            long long coarse = deadline - static_cast<long long>(SPIN_MARGIN_US) * 1000LL;
            struct timespec until;
            until.tv_sec = static_cast<time_t>(coarse / 1000000000LL);
            until.tv_nsec = static_cast<long>(coarse % 1000000000LL);
            clock_nanosleep(CLOCK_MONOTONIC, TIMER_ABSTIME, &until, nullptr);
        }

        do
        {
            clock_gettime(CLOCK_MONOTONIC, &ts);
        } while (static_cast<long long>(ts.tv_sec) * 1000000000LL + ts.tv_nsec < deadline);
    }

    void Release() noexcept
    {
        if (g_fd >= 0)
        {
            ioctl(g_fd, UI_DEV_DESTROY);
            close(g_fd);
            g_fd = -1;
        }
    }
}
