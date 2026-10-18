/**
 * What names a child — in topics (`<name>/status/<child>/…`) and in the HTML and alert texts.
 * Pure. The real names come from WebUntis (`app/data`); by default they never leave the adapter:
 * a child is published under the nickname from `--child <id>=<nickname>`, or as `student_<id>`.
 */

/** an item segment per the mqtt-smarthome spec: snake_case, no `/`, `+`, `#` */
export function slug(text) {
    return (
        String(text)
            .normalize('NFKD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/ß/g, 'ss')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '') || '_'
    );
}

/** `['1234=Max', '5678=Lina']` → Map {1234 => 'Max', 5678 => 'Lina'}; malformed entries are returned in `invalid` */
export function parseNicknames(list = []) {
    const nicknames = new Map();
    const invalid = [];
    for (const entry of list) {
        const m = /^\s*(\d+)\s*=\s*(.+?)\s*$/.exec(String(entry));
        if (m) {
            nicknames.set(Number(m[1]), m[2]);
        } else {
            invalid.push(entry);
        }
    }
    return {nicknames, invalid};
}

/**
 * @param {{id: number, firstName?: string, lastName?: string}} child
 * @param {'nickname'|'firstname'|'fullname'|'id'} mode
 * @param {Map<number, string>} nicknames
 * @returns {{item: string, label: string}} topic segment and display name
 */
export function childName(child, mode, nicknames) {
    const fallback = `student_${child.id}`;
    const nickname = nicknames.get(child.id);
    if (nickname) {
        return {item: slug(nickname), label: nickname};
    }
    switch (mode) {
        case 'firstname':
            return child.firstName
                ? {item: slug(child.firstName), label: child.firstName}
                : {item: fallback, label: fallback};
        case 'fullname': {
            const full = [child.firstName, child.lastName].filter(Boolean).join(' ');
            return full ? {item: slug(full), label: full} : {item: fallback, label: fallback};
        }
        default:
            return {item: fallback, label: fallback};
    }
}

/** names for all children, made unique with `_2`, `_3` … in the order given */
export function childNames(children, mode, nicknames) {
    const seen = new Map();
    return children.map((child) => {
        const name = childName(child, mode, nicknames);
        const n = (seen.get(name.item) ?? 0) + 1;
        seen.set(name.item, n);
        return {...child, ...(n > 1 ? {item: `${name.item}_${n}`, label: name.label} : name)};
    });
}
