const assert = require('assert');
const kimetra = require('../index.cjs');

(async () => {
    try {
        // Basic property checks
        assert.strictEqual(typeof kimetra.version, 'string', 'Version should be a string');
        assert.strictEqual(typeof kimetra.Kimetra, 'function', 'Kimetra should be a class/function');
        assert.strictEqual(typeof kimetra.initialize, 'function', 'initialize should be a function');

        // Initialization check
        const initResult = await kimetra.initialize();
        assert.strictEqual(initResult, true, 'Initialization should return true');

        console.log('✅ Kimetra test passed.');
    } catch (err) {
        console.error('❌ Kimetra test failed:', err.message);
        process.exit(1);
    }
})();
