/**
 * Removes the changelog and the binaries and key maps this machine cannot use.
 *
 * This is a size optimisation only. Kimetra resolves its binary at runtime, so a
 * skipped or failed post-install (--ignore-scripts, pnpm, Yarn PnP) leaves a
 * working package behind, just a larger one.
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

// Never trim a source checkout.
if (fs.existsSync(path.join(root, '.git'))) {
    process.exit(0);
}

const binDir = path.join(root, 'src', 'bin');
const coreDir = path.join(root, 'src', 'core');
const binary = `${process.platform}${process.arch}.node`;
const keymap = `${process.platform}.js`;

// Keep everything for diagnosis if this platform's files are missing.
if (!fs.existsSync(path.join(binDir, binary)) || !fs.existsSync(path.join(coreDir, keymap))) {
    process.exit(0);
}

function remove(file) {
    try {
        fs.unlinkSync(file);
    } catch {
        // Read-only install: stays at full size.
    }
}

function trim(dir, keep, extension) {
    let entries;
    try {
        entries = fs.readdirSync(dir);
    } catch {
        return;
    }

    for (const entry of entries) {
        if (entry !== keep && entry.endsWith(extension)) remove(path.join(dir, entry));
    }
}

trim(binDir, binary, '.node');
trim(coreDir, keymap, '.js');
remove(path.join(root, 'CHANGELOG.md'));
