#include <windows.h>
#include <vector>

#include "backend.h"

#ifndef CREATE_WAITABLE_TIMER_HIGH_RESOLUTION
#define CREATE_WAITABLE_TIMER_HIGH_RESOLUTION 0x00000002
#endif

namespace
{
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
}

namespace kimetra
{
    void Start() noexcept
    {
        QueryPerformanceFrequency(&g_freq);
        EnsureTimer();
    }

    // Input is never blocked by a permission. An elevated foreground window
    // rejects it instead, which SendInput reports.
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

    // Unicode injection. Newline and tab are sent as real key presses and carriage
    // returns are dropped, matching macOS and Linux.
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
