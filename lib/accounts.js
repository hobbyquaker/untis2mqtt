/**
 * The WebUntis logins of an instance: one from `--username` with `--password` or `--secret`, or
 * several from `--accounts-file` — a parent account per child is common, and all of them belong
 * in one instance so the children share one topic tree.
 */

import {readFileSync} from 'node:fs';

/**
 * @param {object} config parsed options (`username`, `password`, `secret`, `accountsFile`)
 * @param {{readFile?: (path: string) => string}} [deps]
 * @returns {Array<{username: string, password?: string, secret?: string}>}
 */
export function loadAccounts(config, {readFile = (path) => readFileSync(path, 'utf8')} = {}) {
    const accounts = [];
    if (config.accountsFile) {
        let list;
        try {
            list = JSON.parse(readFile(config.accountsFile));
        } catch (error) {
            throw new Error(`--accounts-file ${config.accountsFile}: ${error.message}`, {cause: error});
        }
        if (!Array.isArray(list)) {
            throw new Error(`--accounts-file ${config.accountsFile}: expected a JSON array of accounts`);
        }
        list.forEach((entry, index) => {
            if (!entry || typeof entry.username !== 'string' || !entry.username) {
                throw new Error(`--accounts-file: account ${index + 1} has no username`);
            }
            if (!entry.password && !entry.secret) {
                throw new Error(`--accounts-file: account ${entry.username} has neither password nor secret`);
            }
            accounts.push({
                username: entry.username,
                ...(entry.password && {password: String(entry.password)}),
                ...(entry.secret && {secret: String(entry.secret)}),
            });
        });
    }
    if (config.username) {
        if (!config.password && !config.secret) {
            throw new Error('--username needs --password or --secret');
        }
        if (!accounts.some((a) => a.username === config.username)) {
            accounts.push({
                username: config.username,
                ...(config.password && {password: config.password}),
                ...(config.secret && {secret: config.secret}),
            });
        }
    }
    if (accounts.length === 0) {
        throw new Error('no account: give --username with --password or --secret, or --accounts-file');
    }
    return accounts;
}
