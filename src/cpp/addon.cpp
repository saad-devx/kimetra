#include "backend.h"

// N-API bindings for every platform; platform code is behind backend.h.
namespace
{
    using namespace kimetra;

    /** Types text, turning a backend error into a JS exception. */
    bool Type(Napi::Env env, Napi::Value value, bool &threw)
    {
        std::string error;
        bool ok = SendText(value.As<Napi::String>().Utf16Value(), error);
        if (!error.empty())
        {
            Napi::Error::New(env, error).ThrowAsJavaScriptException();
            threw = true;
        }
        return ok;
    }

    Napi::Value Key(const Napi::CallbackInfo &info, bool down)
    {
        Napi::Env env = info.Env();
        if (info.Length() == 0 || !info[0].IsNumber())
            return Napi::Boolean::New(env, false);
        if (!Ready(env))
            return env.Undefined();

        return Napi::Boolean::New(env, SendKey(info[0].As<Napi::Number>().Int32Value(), down));
    }

    Napi::Value JsKeyDown(const Napi::CallbackInfo &info) { return Key(info, true); }
    Napi::Value JsKeyUp(const Napi::CallbackInfo &info) { return Key(info, false); }

    Napi::Value JsSendString(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() == 0 || !info[0].IsString())
            return Napi::Boolean::New(env, false);
        if (!Ready(env))
            return env.Undefined();

        bool threw = false;
        bool ok = Type(env, info[0], threw);
        return threw ? env.Undefined() : Napi::Boolean::New(env, ok);
    }

    Napi::Value JsSleep(const Napi::CallbackInfo &info)
    {
        if (info.Length() > 0 && info[0].IsNumber())
            PreciseSleep(info[0].As<Napi::Number>().Int32Value());
        return info.Env().Undefined();
    }

    // Run(ops, slotCount, texts): executes a batch without returning to JS.
    Napi::Value JsRun(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 2 || !info[0].IsTypedArray() || !info[1].IsNumber())
            return Napi::Boolean::New(env, false);
        if (!Ready(env))
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

        for (uint32_t i = 0; i + 2 < count; i += 3)
        {
            const int32_t a = data[i + 1];
            const int32_t b = data[i + 2];

            switch (data[i])
            {
            case OP_DOWN:
                ok = SendKey(a, true) && ok;
                break;
            case OP_UP:
                ok = SendKey(a, false) && ok;
                break;
            case OP_MOVE:
                ok = MoveMouse(a, b, false) && ok;
                break;
            case OP_MOVE_BY:
                ok = MoveMouse(a, b, true) && ok;
                break;
            case OP_BUTTON_DOWN:
                ok = SendButton(a, true, b) && ok;
                break;
            case OP_BUTTON_UP:
                ok = SendButton(a, false, b) && ok;
                break;
            case OP_SCROLL:
                ok = Scroll(a, b) && ok;
                break;
            case OP_SLEEP:
                PreciseSleep(a);
                break;
            case OP_TEXT:
                if (hasStrings)
                {
                    Napi::Value item = strings.Get(static_cast<uint32_t>(a));
                    if (item.IsString())
                    {
                        bool threw = false;
                        ok = Type(env, item, threw) && ok;
                        if (threw)
                            return env.Undefined();
                    }
                }
                break;
            default:
                break;
            }
        }

        return Napi::Boolean::New(env, ok);
    }

    // MousePosition(): { x, y }, or null where the OS does not expose it.
    Napi::Value JsMousePosition(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();
        int x = 0;
        int y = 0;
        if (!MousePosition(x, y))
            return env.Null();

        Napi::Object point = Napi::Object::New(env);
        point.Set("x", Napi::Number::New(env, x));
        point.Set("y", Napi::Number::New(env, y));
        return point;
    }

    Napi::Value JsCleanup(const Napi::CallbackInfo &info)
    {
        Release();
        return info.Env().Undefined();
    }

    Napi::Object Init(Napi::Env env, Napi::Object exports)
    {
        Start();

        exports.Set("KeyDown", Napi::Function::New(env, JsKeyDown));
        exports.Set("KeyUp", Napi::Function::New(env, JsKeyUp));
        exports.Set("SendString", Napi::Function::New(env, JsSendString));
        exports.Set("Sleep", Napi::Function::New(env, JsSleep));
        exports.Set("Run", Napi::Function::New(env, JsRun));
        exports.Set("MousePosition", Napi::Function::New(env, JsMousePosition));
        exports.Set("Cleanup", Napi::Function::New(env, JsCleanup));
        exports.Set("Format", Napi::Number::New(env, BATCH_FORMAT));

        env.AddCleanupHook([]() { Release(); });

        return exports;
    }
}

NODE_API_MODULE(kimetra, Init)
