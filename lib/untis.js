/**
 * WebUntis client — the REST "view" API the WebUntis web app uses (`/WebUntis/api/rest/view/v1/…`,
 * a session, then a JWT from `/WebUntis/api/token/new`). Not built yet: see the roadmap. Kept in this
 * one module so a move to Untis' announced new API touches nothing else.
 */

export function createClient() {
    throw new Error('the WebUntis client is not implemented yet');
}
