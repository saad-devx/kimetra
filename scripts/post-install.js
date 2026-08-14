/**
 * Removes the binaries and key maps this machine cannot use.
 *
 * This is a size optimisation only. Kimetra resolves its binary at runtime, so a
 * skipped or failed post-install (--ignore-scripts, pnpm, Yarn PnP) leaves a
 * working package behind, just a larger one.
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

// Never trim a source checkout, where the other platforms' files are tracked.
if (fs.existsSync(path.join(root, '.git'))) {
    process.exit(0);
}

const binDir = path.join(root, 'src', 'bin');
const coreDir = path.join(root, 'src', 'core');
const binary = `${process.platform}${process.arch}.node`;
const keymap = `${process.platform}.js`;

// If the file this platform needs is missing, keep everything for diagnosis.
if (!fs.existsSync(path.join(binDir, binary)) || !fs.existsSync(path.join(coreDir, keymap))) {
    process.exit(0);
}

function trim(dir, keep, extension) {
    let entries;
    try {
        entries = fs.readdirSync(dir);
    } catch {
        return;
    }

    for (const entry of entries) {
        if (entry === keep || !entry.endsWith(extension)) continue;
        try {
            fs.unlinkSync(path.join(dir, entry));
        } catch {
            // A read-only install is fine, it just stays at full size.
        }
    }
}

trim(binDir, binary, '.node');
trim(coreDir, keymap, '.js');
