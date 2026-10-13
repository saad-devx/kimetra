{
  "targets": [
    {
      "target_name": "kimetra",
      "sources": ["src/cpp/addon.cpp"],
      "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
      "dependencies": ["<!(node -p \"require('node-addon-api').gyp\")"],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS", "NAPI_VERSION=8"],
      "conditions": [
        ["OS=='win'", {
          "sources": ["src/cpp/win32.cpp"],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "Optimization": "2",
              "FavorSizeOrSpeed": "1",
              "EnableFunctionLevelLinking": "true",
              "WholeProgramOptimization": "true",
              "AdditionalOptions": ["/Gw"]
            },
            "LINK": {
              "LinkTimeCodeGeneration": "true",
              "OptimizeReferences": "2",
              "EnableCOMDATFolding": "2"
            }
          },
          "libraries": ["user32.lib"]
        }],

        ["OS=='mac'", {
          "sources": ["src/cpp/darwin.cpp"],
          "xcode_settings": {
            "OTHER_CPLUSPLUSFLAGS": ["-std=c++17", "-O3", "-flto", "-fvisibility=hidden"]
          },
          "libraries": [
            "-framework CoreFoundation",
            "-framework CoreGraphics",
            "-framework ApplicationServices"
          ]
        }],

        ["OS=='linux'", {
          "sources": ["src/cpp/linux.cpp"],
          "cflags_cc": ["-std=c++17", "-Os", "-flto", "-fvisibility=hidden"],
          "ldflags": ["-flto", "-Wl,--strip-all", "-Wl,--as-needed", "-s"]
        }]
      ]
    }
  ]
}
