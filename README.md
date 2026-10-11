# mentality-tests

Playwright end-to-end tests for the [dzvin.co](https://dzvin.co) Next.js / Zitadel / NestJS integration. These tests target the authentication changes in [mentality-web PR #437](https://github.com/mentality-prj/mentality-web/pull/437).

## Test modes

- **Public security smoke:** Anonymous redirects, BFF authorization, CSRF, JWT response isolation and invalid OIDC callback.
- **Authenticated browser:** HttpOnly cookies, validated session, page reload, BFF, admin denial, refresh/logout and optional cross-tenant checks.
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

For the real login round-trip, set `RUN_LOGIN_E2E=1` and provide `E2E_ZITADEL_USERNAME`, `E2E_ZITADEL_PASSWORD`, `E2E_ZITADEL_USERNAME_SELECTOR`, `E2E_ZITADEL_PASSWORD_SELECTOR`, and `E2E_ZITADEL_SUBMIT_SELECTOR`. Then run:

```bash
E2E_BASE_URL=https://preview.example pnpm exec playwright test --project=zitadel-login-chromium
```

## GitHub Actions

Use **Zitadel / BFF Remote E2E** → **Run workflow**. Supply the preview URL and optionally enable authenticated/session or real-login scenarios. Store sensitive values in the protected `e2e` environment. No production personal accounts, Google passwords, Playwright traces, screenshots or raw authenticated artifacts are required.

The release gate in [mentality-web #439](https://github.com/mentality-prj/mentality-web/issues/439) requires executing the real browser tests against a configured preview. Static checks alone are not a production authorization PASS.
