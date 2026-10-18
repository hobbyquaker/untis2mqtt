import assert from 'node:assert/strict';
import {describe, test} from 'node:test';

import {childName, childNames, parseNicknames, slug} from '../lib/names.js';

const max = {id: 1234, firstName: 'Max', lastName: 'Müller'};

describe('names', () => {
    test('slug is a valid item segment', () => {
        assert.equal(slug('Jörg-Peter Weiß'), 'jorg_peter_weiss');
        assert.equal(slug('a/b+c#d'), 'a_b_c_d');
        assert.equal(slug('  '), '_');
    });

    test('nicknames from --child, malformed entries reported', () => {
        const {nicknames, invalid} = parseNicknames(['1234=Maxi', ' 5678 = Lina ', 'oops']);
        assert.deepEqual(
            [...nicknames],
            [
                [1234, 'Maxi'],
                [5678, 'Lina'],
            ],
        );
        assert.deepEqual(invalid, ['oops']);
    });

    test('nickname mode never publishes a real name', () => {
        assert.deepEqual(childName(max, 'nickname', new Map()), {item: 'student_1234', label: 'student_1234'});
        assert.deepEqual(childName(max, 'id', new Map()), {item: 'student_1234', label: 'student_1234'});
    });

    test('first and full name modes, and the nickname wins', () => {
        assert.deepEqual(childName(max, 'firstname', new Map()), {item: 'max', label: 'Max'});
        assert.deepEqual(childName(max, 'fullname', new Map()), {item: 'max_muller', label: 'Max Müller'});
        assert.deepEqual(childName(max, 'fullname', new Map([[1234, 'Maxi']])), {item: 'maxi', label: 'Maxi'});
    });

    test('duplicates are made unique', () => {
        const kids = [
            {id: 1, firstName: 'Max'},
            {id: 2, firstName: 'Max'},
        ];
        assert.deepEqual(
            childNames(kids, 'firstname', new Map()).map((c) => c.item),
            ['max', 'max_2'],
        );
    });
});
