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
    // Time for the compositor to pick up the new device; too short drops the first key.
    constexpr int DEVICE_SETTLE_US = 250000;

    const char *PERMISSION_HINT =
        "Kimetra cannot open /dev/uinput. Grant access with a udev rule:\n"
        "  echo 'KERNEL==\"uinput\", GROUP=\"input\", MODE=\"0660\"' | "
        "sudo tee /etc/udev/rules.d/99-kimetra.rules\n"
        "  sudo usermod -aG input $USER\n"
        "Then reboot, or run the process as root.";

    int g_keyboard = -1;
    int g_pointer = -1;

    // Creates a virtual device. `declare` sets its event and key bits.
    template <typename Declare>
    int CreateDevice(const char *name, int product, Declare declare) noexcept
    {
        int fd = open("/dev/uinput", O_WRONLY | O_NONBLOCK);
        if (fd < 0)
            return -1;

        struct uinput_setup setup = {};
        setup.id.bustype = BUS_USB;
        setup.id.vendor = 0x1234;
        setup.id.product = static_cast<__u16>(product);
        strncpy(setup.name, name, UINPUT_MAX_NAME_SIZE - 1);

        if (!declare(fd) || ioctl(fd, UI_DEV_SETUP, &setup) < 0 || ioctl(fd, UI_DEV_CREATE) < 0)
        {
            close(fd);
            return -1;
        }

        usleep(DEVICE_SETTLE_US);
        return fd;
    }

    int GetKeyboard() noexcept
    {
        if (g_keyboard < 0)
            g_keyboard = CreateDevice("kimetra-virtual-keyboard", 0x5678, [](int fd) {
                if (ioctl(fd, UI_SET_EVBIT, EV_KEY) < 0 || ioctl(fd, UI_SET_EVBIT, EV_SYN) < 0)
                    return false;
                // Declare the full key range so no mapped key is filtered.
                for (int key = 1; key <= 255; key++)
                    ioctl(fd, UI_SET_KEYBIT, key);
                return true;
            });
        return g_keyboard;
    }

    const int BUTTON_CODES[] = {BTN_LEFT, BTN_RIGHT, BTN_MIDDLE, BTN_SIDE, BTN_EXTRA};

    // A relative mouse, which is what libinput and games expect from a real one.
    int GetPointer() noexcept
    {
        if (g_pointer < 0)
            g_pointer = CreateDevice("kimetra-virtual-pointer", 0x5679, [](int fd) {
                if (ioctl(fd, UI_SET_EVBIT, EV_KEY) < 0 || ioctl(fd, UI_SET_EVBIT, EV_REL) < 0 ||
                    ioctl(fd, UI_SET_EVBIT, EV_SYN) < 0)
                    return false;
                for (int code : BUTTON_CODES)
                    ioctl(fd, UI_SET_KEYBIT, code);
                for (int axis : {REL_X, REL_Y, REL_WHEEL, REL_HWHEEL})
                    ioctl(fd, UI_SET_RELBIT, axis);
                return true;
            });
        return g_pointer;
    }

    void Destroy(int &fd) noexcept
    {
        if (fd >= 0)
        {
            ioctl(fd, UI_DEV_DESTROY);
            close(fd);
            fd = -1;
        }
    }

    bool Emit(int fd, int type, int code, int value) noexcept
    {
        struct input_event ev = {};
        ev.type = static_cast<__u16>(type);
        ev.code = static_cast<__u16>(code);
        ev.value = value;
        return write(fd, &ev, sizeof(ev)) == sizeof(ev);
    }

    // uinput sends scan codes, so text is limited to US QWERTY characters.
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

    // Devices are created on first use, so this only checks access.
    bool Ready(Napi::Env env)
    {
        if (access("/dev/uinput", W_OK) == 0)
            return true;

        Napi::Error::New(env, PERMISSION_HINT).ThrowAsJavaScriptException();
        return false;
    }

    bool SendKey(int code, bool down) noexcept
    {
        int fd = GetKeyboard();
        if (fd < 0)
            return false;

        return Emit(fd, EV_KEY, code, down ? 1 : 0) &&
               Emit(fd, EV_SYN, SYN_REPORT, 0);
    }

    bool SendText(const std::u16string &text, std::string &error)
    {
        int fd = GetKeyboard();
        if (fd < 0)
            return false;

        // Validate first, so a bad character can't leave text half typed.
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

    // Absolute moves need the screen layout, which uinput cannot see, so only
    // relative moves are supported. src/kimetra.js never sends an absolute one here.
    bool MoveMouse(int x, int y, bool relative) noexcept
    {
        int fd = relative ? GetPointer() : -1;
        if (fd < 0)
            return false;

        return (x == 0 || Emit(fd, EV_REL, REL_X, x)) &&
               (y == 0 || Emit(fd, EV_REL, REL_Y, y)) &&
               Emit(fd, EV_SYN, SYN_REPORT, 0);
    }

    // Double clicks are detected from timing, so the click count is not needed.
    bool SendButton(int button, bool down, int) noexcept
    {
        int fd = button >= BUTTON_LEFT && button <= BUTTON_FORWARD ? GetPointer() : -1;
        if (fd < 0)
            return false;

        return Emit(fd, EV_KEY, BUTTON_CODES[button], down ? 1 : 0) &&
               Emit(fd, EV_SYN, SYN_REPORT, 0);
    }

    // evdev counts positive wheel movement as up, the opposite of `down`.
    bool Scroll(int down, int right) noexcept
    {
        int fd = GetPointer();
        if (fd < 0)
            return false;

        return (down == 0 || Emit(fd, EV_REL, REL_WHEEL, -down)) &&
               (right == 0 || Emit(fd, EV_REL, REL_HWHEEL, right)) &&
               Emit(fd, EV_SYN, SYN_REPORT, 0);
    }

    // Neither uinput nor Wayland exposes the pointer position.
    bool MousePosition(int &, int &) noexcept
    {
        return false;
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
        Destroy(g_keyboard);
        Destroy(g_pointer);
    }
}
