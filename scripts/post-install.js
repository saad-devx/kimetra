const fs = require('fs');
const path = require('path');

function cleanBinariesAndCore() {
    const platform = process.platform;   // 'win32', 'darwin', 'linux'
    const arch = process.arch;           // 'x64', 'ia32', 'arm64', etc.

    const binName = `${platform}${arch}.node`;

    const binDir = path.resolve(__dirname, '../src/bin');
    const coreDir = path.resolve(__dirname, '../src/core');
    const kimetraFile = path.resolve(__dirname, '../src/kimetra.js');

    // 1. Cleaning redundant binaries
    try {
        const binFiles = fs.readdirSync(binDir);
        for (const file of binFiles) {
            if (file.endsWith('.node') && file !== binName) {
                try {
                    fs.unlinkSync(path.join(binDir, file));
                } catch (_) { }
            }
        }
    } catch (err) { }

    // 2. Cleaning redundant cores
    const coreFileName = `${platform}.js`;
    try {
        const coreFiles = fs.readdirSync(coreDir);
        for (const file of coreFiles) {
            if (file.endsWith('.js') && file !== coreFileName) {
                try {
                    fs.unlinkSync(path.join(coreDir, file));
                } catch (_) { }
            }
        }
    } catch (err) { }

    // Replacing placeholders in kimetra.js
    try {
        let code = fs.readFileSync(kimetraFile, 'utf8');
        const keymapPath = `./core/${platform}`;
        const binaryPath = `./bin/${platform}${arch}`;

        code = code
            .replace(/require\(['"]\.\/core\/win32\.js['"]\)/g, `require('${keymapPath}')`)
            .replace(/require\(['"]\.\/bin\/win32x64\.node['"]\)/g, `require('${binaryPath}')`);

        fs.writeFileSync(kimetraFile, code, 'utf8');
    } catch (_) { }
}

cleanBinariesAndCore();
