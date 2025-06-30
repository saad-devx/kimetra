/**
 * Kimetra
 * 
 * @author Saad
 * @version 1.0.0
 * @license MIT
 */

'use strict';

const {
    Key,
    Kimetra,
    Kimacro,
    createKimetra,
    createKimacro,
    quickActions,
} = require('./src/kimetra');

const packageInfo = require('./package.json');

/**
 * Initializes the library and performs basic checks
 */
async function initialize() {
    if (!['win32', 'darwin', 'linux'].includes(process.platform)) {
        throw new Error(`Platform ${process.platform} is not supported`);
    }

    try {
        const kimetra = new Kimetra();
        kimetra.cleanup();
        return true;
    } catch (error) {
        throw new Error(`Failed to initialize kimetra: ${error.message}`);
    }
}

// Main library exports
export const version = packageInfo.version
export const name = packageInfo.name
export {
    // Main classes and key map
    Key,
    Kimetra,
    Kimacro,

    // Factory functions
    createKimetra,
    createKimacro,

    // Quick actions
    quickActions,

    // Initialization
    initialize
}