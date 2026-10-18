/**
 * TOTP (RFC 6238, SHA-1, 30 s, 6 digits) for the WebUntis app secret — the `key` of the
 * `untis://setschool?…` QR code under Profile → Data access. Pure, `node:crypto` only.
 */

import {createHmac} from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 → Buffer; spaces, dashes and padding are ignored, case does not matter */
export function base32Decode(text) {
    const clean = String(text)
        .toUpperCase()
        .replace(/[\s=-]/g, '');
    let bits = 0;
    let value = 0;
    const bytes = [];
    for (const ch of clean) {
        const index = BASE32.indexOf(ch);
        if (index === -1) {
            throw new Error('the secret is not base32');
        }
        value = (value << 5) | index;
        bits += 5;
        if (bits >= 8) {
            bits -= 8;
            bytes.push((value >>> bits) & 0xff);
        }
    }
    return Buffer.from(bytes);
}

/**
 * @param {string} secret base32
 * @param {number} [time] ms since the epoch
 * @param {{digits?: number, step?: number}} [options]
 * @returns {string} the one-time password, zero-padded
 */
export function totp(secret, time = Date.now(), {digits = 6, step = 30} = {}) {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / step)));
    const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
    return String(code).padStart(digits, '0');
}
