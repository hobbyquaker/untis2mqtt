import assert from 'node:assert/strict';
import {describe, test} from 'node:test';

import {loadAccounts} from '../lib/accounts.js';

const file = (content) => ({readFile: () => content});

describe('accounts', () => {
    test('one account from the options', () => {
        assert.deepEqual(loadAccounts({username: 'u', password: 'p'}), [{username: 'u', password: 'p'}]);
        assert.deepEqual(loadAccounts({username: 'u', secret: 'S'}), [{username: 'u', secret: 'S'}]);
    });

    test('several from the accounts file, plus the options unless duplicated', () => {
        const json = JSON.stringify([
            {username: 'a', password: '1'},
            {username: 'b', secret: 'S'},
        ]);
        assert.deepEqual(loadAccounts({accountsFile: 'x.json'}, file(json)), [
            {username: 'a', password: '1'},
            {username: 'b', secret: 'S'},
        ]);
        assert.equal(loadAccounts({accountsFile: 'x.json', username: 'a', password: '1'}, file(json)).length, 2);
        assert.equal(loadAccounts({accountsFile: 'x.json', username: 'c', password: '3'}, file(json)).length, 3);
    });

    test('mistakes are reported, not guessed around', () => {
        assert.throws(() => loadAccounts({}), /no account/);
        assert.throws(() => loadAccounts({username: 'u'}), /--password or --secret/);
        assert.throws(() => loadAccounts({accountsFile: 'x.json'}, file('{')), /x\.json/);
        assert.throws(() => loadAccounts({accountsFile: 'x.json'}, file('{}')), /JSON array/);
        assert.throws(() => loadAccounts({accountsFile: 'x.json'}, file('[{"password":"p"}]')), /no username/);
        assert.throws(() => loadAccounts({accountsFile: 'x.json'}, file('[{"username":"u"}]')), /neither/);
    });
});
