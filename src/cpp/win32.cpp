#include <windows.h>
#include <climits>
#include <cstdint>
#include <vector>

#include "backend.h"

#ifndef CREATE_WAITABLE_TIMER_HIGH_RESOLUTION
#define CREATE_WAITABLE_TIMER_HIGH_RESOLUTION 0x00000002
#endif
#ifndef MOUSEEVENTF_HWHEEL
#define MOUSEEVENTF_HWHEEL 0x01000
#endif
#ifndef MOUSEEVENTF_VIRTUALDESK
#define MOUSEEVENTF_VIRTUALDESK 0x4000
#endif

namespace
{
    LARGE_INTEGER g_freq = {0};
    HANDLE g_timer = nullptr;

    // SetThreadDpiAwarenessContext, Windows 10 1607+. Looked up at runtime so the
    // addon still loads on older versions.
    using SetDpiContext = HANDLE(WINAPI *)(HANDLE);
    SetDpiContext g_setDpiContext = nullptr;

    HANDLE EnsureTimer() noexcept
    {
        if (!g_timer)
        {
            g_timer = CreateWaitableTimerExW(nullptr, nullptr,
                                             CREATE_WAITABLE_TIMER_HIGH_RESOLUTION,
                                             TIMER_ALL_ACCESS);
            if (!g_timer)
                g_timer = CreateWaitableTimerExW(nullptr, nullptr, 0, TIMER_ALL_ACCESS);
        }
        return g_timer;
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

    // Per-monitor DPI awareness for the current call only, so coordinates are physical
    // pixels whatever the host process declares.
    struct PhysicalPixels
    {
        HANDLE previous = nullptr;

        PhysicalPixels() noexcept
        {
            if (!g_setDpiContext)
                return;
            previous = g_setDpiContext(reinterpret_cast<HANDLE>(static_cast<intptr_t>(-4))); // per monitor v2
            if (!previous)
                previous = g_setDpiContext(reinterpret_cast<HANDLE>(static_cast<intptr_t>(-3))); // per monitor
        }

        ~PhysicalPixels()
        {
            if (previous)
                g_setDpiContext(previous);
        }
    };

    // Windows maps a normalized coordinate n to pixel floor(n * size / 65536), so aim at
    // the centre of the target pixel.
    LONG Normalize(long long pixel, int size) noexcept
    {
        if (pixel < 0)
            pixel = 0;
        if (pixel >= size)
            pixel = size - 1;
        return static_cast<LONG>(((2 * pixel + 1) * 65536 + size) / (2LL * size));
    }

    bool SendMouse(DWORD flags, LONG dx, LONG dy, DWORD data) noexcept
    {
        INPUT input = {};
        input.type = INPUT_MOUSE;
        input.mi.dx = dx;
        input.mi.dy = dy;
        input.mi.mouseData = data;
        input.mi.dwFlags = flags;
        return SendInput(1, &input, sizeof(INPUT)) == 1;
    }

    // WHEEL_DELTA (120) is one notch.
    bool Wheel(DWORD flag, long long notches) noexcept
    {
        long long amount = notches * WHEEL_DELTA;
        if (amount > INT_MAX)
            amount = INT_MAX;
        if (amount < INT_MIN)
            amount = INT_MIN;
        return SendMouse(flag, 0, 0, static_cast<DWORD>(static_cast<LONG>(amount)));
    }
}

namespace kimetra
{
    void Start() noexcept
    {
        QueryPerformanceFrequency(&g_freq);
        EnsureTimer();

        HMODULE user32 = GetModuleHandleW(L"user32.dll");
        if (user32)
            g_setDpiContext = reinterpret_cast<SetDpiContext>(
                GetProcAddress(user32, "SetThreadDpiAwarenessContext"));
    }

    // No permission needed; an elevated window rejects input instead.
    bool Ready(Napi::Env)
    {
        return true;
    }

    bool SendKey(int code, bool down) noexcept
    {
        WORD vk = static_cast<WORD>(code);

        INPUT input = {};
        input.type = INPUT_KEYBOARD;
        input.ki.wVk = vk;
        input.ki.wScan = static_cast<WORD>(MapVirtualKeyW(vk, MAPVK_VK_TO_VSC));
        input.ki.dwFlags = (down ? 0 : KEYEVENTF_KEYUP) |
                           (IsExtended(vk) ? KEYEVENTF_EXTENDEDKEY : 0);

        return SendInput(1, &input, sizeof(INPUT)) == 1;
    }

    // Newline and tab are real key presses; carriage returns are dropped.
    bool SendText(const std::u16string &text, std::string &)
    {
        std::vector<INPUT> inputs;
        inputs.reserve(text.size() * 2);

        for (char16_t ch : text)
        {
            if (ch == u'\r')
                continue;

            INPUT down = {};
            down.type = INPUT_KEYBOARD;

            if (ch == u'\n' || ch == u'\t')
            {
                WORD vk = (ch == u'\t') ? VK_TAB : VK_RETURN;
                down.ki.wVk = vk;
                down.ki.wScan = static_cast<WORD>(MapVirtualKeyW(vk, MAPVK_VK_TO_VSC));
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

        if (inputs.empty())
            return true;

        UINT sent = SendInput(static_cast<UINT>(inputs.size()), inputs.data(), sizeof(INPUT));
        return sent == inputs.size();
    }

    // Absolute moves span the whole virtual desktop. Relative moves go through the
    // pointer speed and acceleration settings, as a real mouse does.
    bool MoveMouse(int x, int y, bool relative) noexcept
    {
        if (relative)
            return SendMouse(MOUSEEVENTF_MOVE, x, y, 0);

        PhysicalPixels scope;
        int left = GetSystemMetrics(SM_XVIRTUALSCREEN);
        int top = GetSystemMetrics(SM_YVIRTUALSCREEN);
        int width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        int height = GetSystemMetrics(SM_CYVIRTUALSCREEN);
        if (width < 1 || height < 1)
            return false;

        return SendMouse(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK,
                         Normalize(static_cast<long long>(x) - left, width),
                         Normalize(static_cast<long long>(y) - top, height),
                         0);
    }

    // Windows detects double clicks from timing, so the click count is not needed.
    bool SendButton(int button, bool down, int) noexcept
    {
        switch (button)
        {
        case BUTTON_LEFT:
            return SendMouse(down ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP, 0, 0, 0);
        case BUTTON_RIGHT:
            return SendMouse(down ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_RIGHTUP, 0, 0, 0);
        case BUTTON_MIDDLE:
            return SendMouse(down ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_MIDDLEUP, 0, 0, 0);
        case BUTTON_BACK:
        case BUTTON_FORWARD:
            return SendMouse(down ? MOUSEEVENTF_XDOWN : MOUSEEVENTF_XUP, 0, 0,
                             button == BUTTON_BACK ? XBUTTON1 : XBUTTON2);
        default:
            return false;
        }
    }

    bool Scroll(int down, int right) noexcept
    {
        bool ok = true;
        if (down)
            ok = Wheel(MOUSEEVENTF_WHEEL, -static_cast<long long>(down)) && ok;
        if (right)
            ok = Wheel(MOUSEEVENTF_HWHEEL, right) && ok;
        return ok;
    }

    bool MousePosition(int &x, int &y) noexcept
    {
        PhysicalPixels scope;
        POINT point;
        if (!GetCursorPos(&point))
            return false;
        x = point.x;
        y = point.y;
        return true;
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
                WaitForSingleObject(timer, INFINITE);
        }

        LARGE_INTEGER now;
        do
        {
            QueryPerformanceCounter(&now);
        } while (now.QuadPart < deadline);
    }

    void Release() noexcept
    {
        if (g_timer)
        {
            CloseHandle(g_timer);
            g_timer = nullptr;
        }
    }
}
