# Kimetra

[![npm version](https://badge.fury.io/js/kimetra.svg)](https://badge.fury.io/js/kimetra)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/kimetra.svg)](https://nodejs.org)
[![Platform Support](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue.svg)](#platform-support)

Kimetra is a cross-platform keyboard automation library for Node.js. It's performance first library which focuses on max speed, precision with no external dependencies at all. It can be easily used for gaming macros as well as any automation tool and script.

## ✨ Features

- **🚀 Native Performance**: Direct OS API calls via highly optimized precompiled binaries.
- **🔄 Cross-Platform**: Seamless support for Windows, macOS, and Linux.
- **⌨️ Complete Control**: Manipulate single & multiple keys, combinations, typing, and macros with maximum precision.
- **📦 Easy & Light Weight**: Simple, intuitive API with less than < 100Kb size and no external dependencies.
- **🔧 Flexible**: Factory functions, quick actions, and a powerful chainable macro system.
- **⚡ Ultra-Fast & Precise**: Optimized for lightning-fast execution and **microsecond-accurate** delays.
- **🔌 Low-Level Access**: Direct access to platform-specific APIs and precise sleep functions.


## 🛌 How it works

Kimetra uses Node addons built with C++ which uses the OS native APIs for every core functionality. Each addon file is pre-compiled for every major OS and their archs (i.e Linux, Mac and Windows) hence no external dependency needed and not even the compile time overhead, making it ultra fast and reliable on older or power efficient systems. But it gets better. For each arch of each OS, a separate pre-compiled addon file is created and all of the redudant files as well as separate key mapping files are removed during the installation time leaving no unuseful bit on user's device. Making its total size less than 100Kb on windows and even lesser on unix systems. Making the Kimetra potentially a chad in marketplace 🗿.


## 🚀 Quick Start

### Installation

```bash
npm install kimetra
```

### Basic Usage

```javascript
const { createKimetra, Key, quickActions } = require('kimetra');

// Create the Kimetra instance
const kimetra = createKimetra();

// Basic operations
await kimetra.pressKey(Key.enter);
await kimetra.pressHotkey([Key.ctrl, Key.c]); // Ctrl + C
await kimetra.pressKeys([Key.a, Key.b, Key.c]); // Press multiple keys in a series
await kimetra.typeText('Kimetra focuses on max speed, performance, accuracy and being light weight ⚡'); // With Unicode characters support

// Cleanup when done
kimetra.cleanup();


// Quick actions (one-liner usage) - ideal for single operations
await quickActions.typeText('Touching grass can stabilize body currents and improve your hemispheres to write good code 😎');
await quickActions.pressKey(Key.enter);
await quickActions.copy();
await quickActions.paste();

// For Mac
await quickActions.cmdCopy();
await quickActions.cmdPaste();
```

## 📚 API Reference

### Main Classes

The main class for keyboard automation operations.

```javascript
const kimetra = createKimetra({
  defaultDelay: 0, // Default initial delay before an action (µs)
  defaultInterval: 700, // Default intervals such as between multiple key press utilities (µs)
  defaultDuration: 700, // Default duration to hold keys (µs)
  defaultHotkeyDelay: 1500 // Default duration for hotkey combinations (µs)
});
```

**Methods:**

- \`pressKey(key, duration?, delay?)\` - Press a single key with optional duration and initial delay.
- \`pressKeys(keys[], interval?, delay?)\` - Press multiple keys in sequence with customizable interval and initial delay.
- \`pressHotkey(keys[], duration?, delay?)\` - Perform a key combination (hotkey) with specified hold duration and initial delay.
- \`typeText(text, delay?)\` - Type text character by character with an optional initial delay.
- \`holdKey(key, duration?, delay?)\` - Hold a key for a specified duration with an optional initial delay.
- \`repeatKey(key, times, interval?, delay?)\` - Repeat key press multiple times with customizable interval and initial delay.
- \`executeSequence(actions[])\` - Execute a defined sequence of keyboard actions.
- \`cleanup()\` - Release native resources when automation tasks are complete.

#### Keyboard Macros

Create and execute sequences of keyboard actions with a fluent, chainable API for complex automations.

```javascript
const { createKimacro, Key } = require('kimetra');

// Create a macro with a sequence of actions
const macro = createKimacro()
  .pressKey(Key.enter)
  .typeText('Drinking plenty water can make you chad 🗿')
  .pressHotkey([Key.ctrl, Key.s])
  .wait(1000 * 1000); // Wait for 1 second (100,00,00 microseconds)

// Execute the macro
await macro.execute();
```

**Macro Methods:**

- \`pressKey(key, duration?, delay?)\` - Add key press action to the sequence.
- \`typeText(text, delay?)\` - Add text typing action to the sequence.
- \`pressHotkey(keys[], duration?, delay?)\` - Add hotkey combination action to the sequence.
- \`wait(duration)\` - Add a delay (in milliseconds) to the macro sequence.
- \`execute()\` - Run the defined macro sequence.
- \`toJSON()\` - Serialize the macro sequence for storage.
- \`fromJSON(data)\` - Load a macro from serialized data.
- \`cleanup()\` - Clear the macro sequence and release associated resources.

### Quick Actions

Convenient functions for one-time keyboard operations without the need to create a `Kimetra` instance.

```javascript
const { quickActions } = require('kimetra');

await quickActions.pressKey(Key.enter);
await quickActions.pressHotkey([Key.ctrl, Key.c]);
await quickActions.typeText('For max performance, `Kimetra` class be used directly because each quickAction function initializes and cleans up the class each time you use it. 🤯');
await quickActions.copy();
await quickActions.paste();
await quickActions.altTab();
```

### Convenience Methods

Pre-built methods for common and platform-specific keyboard operations, simplifying complex tasks.

```javascript
// Text editing
await kimetra.copy();
await kimetra.paste();
await kimetra.cut();
await kimetra.selectAll();
await kimetra.undo();
await kimetra.redo();
await kimetra.save();
await kimetra.find();
await kimetra.replace();

// Navigation
await kimetra.altTab();
await kimetra.altF4();
await kimetra.winKey();
await kimetra.taskManager();
await kimetra.enter();
await kimetra.escape();
await kimetra.tab(3); // Press tab 3 times

// Special keys
await kimetra.space(2); // Press space twice
await kimetra.backspace(3); // Press backspace 3 times
await kimetra.delete();

// Arrow keys
await kimetra.arrowUp(5, 100); // 5 times with 100 microsecond interval
await kimetra.arrowDown();
await kimetra.arrowLeft();
await kimetra.arrowRight();

// Function keys
await kimetra.f1();
await kimetra.f5(); // Refresh
await kimetra.f12();

// macOS specific (automatically mapped to Cmd key)
await kimetra.cmdCopy();
await kimetra.cmdPaste();
await kimetra.cmdCut();
await kimetra.cmdSave();
await kimetra.cmdTab();
```

## ⚡ Advanced Usage

### Sequence Execution

For highly customized and complex automation sequences, providing granular control over each step.

```javascript
await kimetra.executeSequence([
  { type: 'hotkey', keys: [Key.alt, Key.tab], delay: 1000 }, // Delay in microseconds
  { type: 'wait', duration: 500000 }, // Wait in microseconds (500ms)
  { type: 'type', text: 'Sequence text', interval: 20 }, // Interval in microseconds
  { type: 'key', key: Key.enter },
  { type: 'hold', key: Key.lshift, duration: 1000000 } // Duration in microseconds (1 second)
]);
```

### Macro System

Create, save, and load complex automation macros for reusable and shareable workflows.

```javascript
const { createKimacro } = require('kimetra');
const fs = require('fs');

// Create and save a macro
const loginMacro = createKimacro()
  .typeText('johndoe_is_a_cliche')
  .pressKey(Key.tab)
  .typeText('password123')
  .pressKey(Key.enter);

// Save to JSON
const macroData = loginMacro.toJSON();
fs.writeFileSync('login-macro.json', JSON.stringify(macroData));

// Load from JSON
const savedData = JSON.parse(fs.readFileSync('login-macro.json'));
const loadedMacro = createKimacro().fromJSON(savedData);

// Execute the loaded macro
await loadedMacro.exec();
```

### 🧮 Low-Level API Access

Kimetra provides direct access to its low-level, platform-specific implementations for advanced users requiring maximum control or custom functionality. This includes the highly accurate `Sleep` function as well with microseconds accuracy. Using native `Sleep` function is highly recommended instead of JS's `setTimeout` with Promise. Using pure JS among native events will add an extra latency of contexts switching overhead.

```javascript
const { Kimetra } = require('kimetra');

const kimetra = new Kimetra();
const kiCore = kimetra.core; // `core` contains every C++ addon function i.e. KeyDown, KeyUp, SendString, Sleep and Cleanup

// Access platform-specific methods
kiCore.KeyDown(Key.enter);  // Press key down
kiCore.Sleep(500)       // Wait for 500µs
kiCore.KeyUp(Key.enter);    // Release key
kiCore.Sleep(1000000)
// Send a string with unicode characters
kiCore.SendString(`👀 Fun fact: The name "Kimetra" is a combination of "Key" + "Simulation" + "Spectra".
"Metra" also means "Womb", the low leve place where it all started.`);

// Get information about the current platform
console.log(`Current platform: ${kimetra.os}`); // Use kimetra.os

// Precise sleep function (microseconds accuracy)
await kimetra.sleep(100); // Sleep for 100 microseconds

// Always clean up when done
kimetra.cleanup();
```


## 📄 License
MIT © Saad