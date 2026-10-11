# mentality-tests — Zitadel / BFF E2E

This repository validates the **Next.js 16 / Zitadel / NestJS BFF** authorization boundary
proposed in [mentality-web PR #437](https://github.com/mentality-prj/mentality-web/pull/437).
The previous Google OAuth/NextAuth tests and interactive global setup were removed.

## Three independent modes

1. **Anonymous security smoke** — no credentials; checks protected redirects, token API,
   BFF authorization, CSRF origin validation, invalid callback. Run only against a
   deployment containing PR #437.
2. **Authenticated session** — dedicated *low-privilege* test user. A valid Playwright
   storageState from that deployment is provided as a base64 secret; checks JWT isolation,
   HttpOnly/Secure cookie, protected page hard reload, BFF, denied admin, and (if supplied)
   a foreign-tenant resource.
3. **Real Zitadel login** — separate opt-in browser round-trip: login redirect, PKCE S256,
   authorization code exchange, verified session. Uses a dedicated test-only Zitadel account
   and tenant-specific CSS selectors. No production personal accounts, Google passwords or
   direct manipulation of private cookies.

### Setup

Use Node 22 and pnpm 10:

    pnpm install --frozen-lockfile
    pnpm exec playwright install chromium
    pnpm lint
    pnpm typecheck
    pnpm prettier
    pnpm exec playwright test --list

Set E2E_BASE_URL to the URL of the deployment under test (for example a dedicated Vercel
preview with BFF changes). URL must not be the repository URL.

    E2E_BASE_URL=https://preview.example pnpm test -- --project=public-chromium

Authenticated run (never commit the state file, and do not print the secret):

    RUN_AUTH_E2E=1
    E2E_BASE_URL=https://preview.example
    E2E_AUTH_STORAGE_STATE_BASE64=<base64 Playwright storageState JSON>
    pnpm exec playwright test --project=authenticated-chromium

Optional E2E_FOREIGN_RESOURCE_PATH must be a known GET-only BFF route in a **different
test tenant**, for example /api/backend/research/projects/<foreign-id>. Without it,
that one test explicitly skips; cross-tenant isolation is *not* certified.

Real IdP round-trip:

    RUN_LOGIN_E2E=1
    E2E_ZITADEL_USERNAME=<test account>
    E2E_ZITADEL_PASSWORD=<test password>
    E2E_ZITADEL_USERNAME_SELECTOR=<selector>
    E2E_ZITADEL_PASSWORD_SELECTOR=<selector>
    E2E_ZITADEL_SUBMIT_SELECTOR=<selector>
    pnpm exec playwright test --project=zitadel-login-chromium

### CI and release criteria

Pull requests run lint, formatting, typecheck, test discovery. They **do not** pretend that
these checks are live authenticated E2E. The remote Playwright workflow is started manually
with a target URL. Auth/login jobs are opt-in, use GitHub secrets and cannot run on forks.

Test state is written to gitignored \`playwright/.auth/\`, with restricted permissions;
browser traces, videos and screenshots are disabled for all auth tests. Do not upload
authenticated Playwright reports, request dumps or storage state.

**Release gate (#439):** login + refresh + logout + authorization / tenant isolation must
be checked against a deployed preview and dedicated test data before merging mentality-web
PR #437. The automated checks alone are not evidence of production readiness.
