# mentality-tests

Playwright end-to-end tests for the [dzvin.co](https://dzvin.co) Next.js / Zitadel / NestJS integration. These tests target the authentication changes in [mentality-web PR #437](https://github.com/mentality-prj/mentality-web/pull/437).

## Test modes

- **Public security smoke:** Anonymous redirects, BFF authorization, CSRF, JWT response isolation and invalid OIDC callback.
- **Authenticated browser:** HttpOnly cookies, validated session, page reload, BFF, admin denial, refresh/logout and optional cross-tenant checks.
- **Privileged roles:** Dedicated admin, company and research identities validate authorized UI and cross-role rejection.
- **Expired-token lifecycle:** A dedicated session forces token expiry and tests two concurrent tabs, without altering production accounts.
- **Disposable mood mutation:** Opt-in real write/read against an isolated test tenant, with explicit post-run data cleanup.
- **Real Zitadel login:** Authorization-code PKCE S256 round-trip with an isolated Zitadel test account.

PR CI performs static validation and Playwright test discovery. It does **not** run authenticated checks against production.

## Local setup

Requires Node.js 22 and pnpm 10 (use the version pinned in `package.json`).

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm lint
pnpm prettier
pnpm typecheck
pnpm exec playwright test --list
```

Run anonymous smoke against the **deployed preview of PR #437**:

```bash
E2E_BASE_URL=https://preview.example pnpm exec playwright test --project=public-chromium
```

Run a dedicated low-privilege authenticated account:

```bash
RUN_AUTH_E2E=1 E2E_BASE_URL=https://preview.example pnpm exec playwright test --project=authenticated-chromium
```

Set `E2E_AUTH_STORAGE_STATE_BASE64` to the base64-encoded Playwright storageState for that preview and test user. The local state is written to the gitignored `playwright/.auth/` directory. Never commit or print it.

For cross-tenant isolation, set `E2E_FOREIGN_RESOURCE_PATH` to a known GET-only BFF endpoint for a resource in another test tenant. Without it, that single case explicitly skips and tenant isolation is **not certified**.

For privileged-role coverage, set `RUN_ROLE_E2E=1` with `E2E_ADMIN_STORAGE_STATE_BASE64`, `E2E_COMPANY_STORAGE_STATE_BASE64`, and `E2E_RESEARCH_STORAGE_STATE_BASE64`. Each account must belong to the preview's test tenant and have the named role.

For the real login round-trip, set `RUN_LOGIN_E2E=1` and provide `E2E_ZITADEL_USERNAME`, `E2E_ZITADEL_PASSWORD`, `E2E_ZITADEL_USERNAME_SELECTOR`, `E2E_ZITADEL_PASSWORD_SELECTOR`, and `E2E_ZITADEL_SUBMIT_SELECTOR`. Then run:

```bash
E2E_BASE_URL=https://preview.example pnpm exec playwright test --project=zitadel-login-chromium
```

## GitHub Actions

Use **Zitadel / BFF Remote E2E** → **Run workflow**. Supply the preview URL and optionally enable authenticated/session, privileged-role or real-login scenarios. Store sensitive values in the protected `e2e` environment. No production personal accounts, Google passwords, Playwright traces, screenshots or raw authenticated artifacts are required.

The release gate in [mentality-web #439](https://github.com/mentality-prj/mentality-web/issues/439) requires executing the real browser tests against a configured preview. Static checks alone are not a production authorization PASS.

### Lifecycle and write test isolation

For real expiry/concurrency tests, set `RUN_LIFECYCLE_E2E=1` and `E2E_LIFECYCLE_STORAGE_STATE_BASE64` to a **fresh independent Zitadel test account**. The test modifies its HttpOnly cookie expiry and navigates two tabs simultaneously. A rotating refresh token can invalidate the stored state; generate a fresh state for each run. A concurrency failure is a **release defect**, not a test flake to skip.

For real mood writes, set `RUN_MOOD_MUTATION_E2E=1`, `E2E_MUTATION_STORAGE_STATE_BASE64`, `E2E_DISPOSABLE_TENANT_CONFIRMED=1` and `E2E_ALLOWED_MUTATION_ORIGIN` to the exact origin of the preview (e.g. `https://test-preview.example`). Set the last two as independent protected `e2e` environment variables; enabling the workflow toggle alone is never authorization to write data. The test writes a new mood record and reads it back. **NestJS currently has no mood-record DELETE endpoint**, so it cannot clean up the record automatically. Use only a disposable test tenant, and reset that tenant's data through its approved test teardown after the run. Never run this mode against personal or production patient data.

## Mandatory production release qualification

Use the **Dzvin Production Release Qualification** workflow (separate from the optional smoke workflow) against an authorized, protected preview with a dedicated Zitadel callback origin and disposable NestJS tenant. All eight Playwright projects execute; missing credentials, cross-tenant test resource, role checks, mood mutation authorization, test skips, and incomplete results make the gate FAIL. A green optional smoke workflow is **not** production qualification.

Configure the existing protected GitHub Actions `e2e` environment with the six dedicated storageState secrets, Zitadel login credentials/selectors and all three release variables: `E2E_FOREIGN_RESOURCE_PATH`, `E2E_ALLOWED_MUTATION_ORIGIN`, `E2E_DISPOSABLE_TENANT_CONFIRMED=1`. Use an approved Vercel protected-preview access mechanism; do **not** disable protection or reuse production accounts. The mood test leaves a record: the dedicated test tenant must be reset after qualification. Never promote production until these tests actually pass and cleanup is verified.
