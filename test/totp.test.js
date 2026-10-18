import assert from 'node:assert/strict';
import {describe, test} from 'node:test';

import {base32Decode, totp} from '../lib/totp.js';

// RFC 6238 appendix B, SHA-1: the secret is the ASCII string "12345678901234567890"
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totp', () => {
    test('base32 decodes, ignoring case, spaces and padding', () => {
        assert.equal(base32Decode(RFC_SECRET).toString(), '12345678901234567890');
        assert.equal(base32Decode('gezd gnbv gy3t qojq gezd gnbv gy3t qojq==').toString(), '12345678901234567890');
        assert.throws(() => base32Decode('not base32!'), /base32/);
    });

    test('RFC 6238 test vectors (8 digits)', () => {
        assert.equal(totp(RFC_SECRET, 59_000, {digits: 8}), '94287082');
        assert.equal(totp(RFC_SECRET, 1_111_111_109_000, {digits: 8}), '07081804');
        assert.equal(totp(RFC_SECRET, 2_000_000_000_000, {digits: 8}), '69279037');
    });

    test('six digits by default, zero-padded', () => {
        assert.equal(totp(RFC_SECRET, 1_111_111_109_000), '081804');
    });
});
