{
  "targets": [
    {
      "target_name": "keyboard",
      "sources": [],
      "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
      "dependencies": ["<!(node -p \"require('node-addon-api').gyp\")"],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "conditions": [
        ["OS=='win'", {
          "sources": ["src/cpp/win32-imetra.cpp"],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "Optimization": "2",                 
              "EnableFunctionLevelLinking": "true",
              "FavorSizeOrSpeed": "1",             
              "WholeProgramOptimization": "true",  
              "AdditionalOptions": [
                "/O2",       
                "/GL",       
                "/std:c++20",
                "/Gw",       
                "/Gy"        
              ]
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
          "sources": ["src/cpp/darwin-imetra.cpp"],
          "xcode_settings": {
            "OTHER_CPLUSPLUSFLAGS": [
              "-std=c++20",
              "-O3",                
              "-flto",              
              "-fvisibility=hidden" 
            ]
          },
          "libraries": [
            "-framework CoreFoundation",
            "-framework CoreGraphics",
            "-framework Carbon"
          ]
        }],

        ["OS=='linux'", {
          "sources": ["src/cpp/linux-imetra.cpp"],
          "cflags": [
            "-std=c++20",
            "-O3",                
            "-flto",              
            "-fvisibility=hidden" 
          ],
          "ldflags": [
            "-flto",
            "-Wl,--strip-all",
            "-Wl,--as-needed",
            "-s"
          ],
          "libraries": ["-lX11", "-lXtst"]
        }]
      ]
    }
  ]
}
