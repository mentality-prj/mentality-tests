import { expect, request as playwrightRequest, test } from '@playwright/test';

const rolesUrl = (companyId: string, userId: string) =>
  '/api/backend/companies/' + companyId + '/employees/' + userId + '/role';

const stateFiles = {
  companyAAdmin: 'playwright/.auth/b2b-a-admin.json',
  companyBAdmin: 'playwright/.auth/b2b-b-admin.json',
  companyAEmployee: 'playwright/.auth/b2b-a-employee.json',
};

function requiredFixture(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(name + ' is required for a seeded B2B role-mutation test');
  return value;
}

test.describe('Gate 2 / disposable company role mutations', () => {
  test('canonical company promotion and demotion are reflected in a real employee session', async ({
    baseURL,
  }) => {
    const origin = new URL(baseURL!).origin;
    const companyId = requiredFixture('E2E_B2B_COMPANY_A_ID');
    const employeeId = requiredFixture('E2E_B2B_USER_A_ID');
    const admin = await playwrightRequest.newContext({
      baseURL,
      storageState: stateFiles.companyAAdmin,
    });
    const employee = await playwrightRequest.newContext({
      baseURL,
      storageState: stateFiles.companyAEmployee,
    });
    let attempted = false;
    try {
      const before = await employee.get('/api/auth/session');
      expect(before.status()).toBe(200);
      expect(await before.json()).toEqual(
        expect.objectContaining({ id: employeeId, companyId, companyRole: 'employee' }),
      );

      attempted = true;
      const promotion = await admin.patch(rolesUrl(companyId, employeeId), {
        headers: { origin },
        data: { companyRole: 'superuser' },
      });
      expect(promotion.status()).toBe(200);

      const promotedSession = await employee.get('/api/auth/session');
      expect(promotedSession.status()).toBe(200);
      expect(await promotedSession.json()).toEqual(
        expect.objectContaining({ id: employeeId, companyId, companyRole: 'superuser' }),
      );
      const allowed = await employee.get('/api/backend/companies/' + companyId + '/access-scopes');
      expect(allowed.status()).toBe(200);
    } finally {
      // Never intentionally leave a disposable E2E user with elevated rights.
      // A failed restoration is a release blocker requiring test-tenant reset.
      if (attempted) {
        const restored = await admin.patch(rolesUrl(companyId, employeeId), {
          headers: { origin },
          data: { companyRole: 'employee' },
        });
        expect(restored.status(), 'Privilege restoration must succeed').toBe(200);
        const reverted = await employee.get('/api/auth/session');
        expect(reverted.status()).toBe(200);
        expect(await reverted.json()).toEqual(
          expect.objectContaining({ id: employeeId, companyId, companyRole: 'employee' }),
        );
        const denied = await employee.get('/api/backend/companies/' + companyId + '/access-scopes');
        expect(denied.status()).toBe(403);

        // The server must recheck canonical admin membership inside group CRUD
        // transactions, even when an earlier browser guard saw a former admin.
        const deniedCreate = await employee.post(
          '/api/backend/companies/' + companyId + '/groups',
          {
            headers: { origin },
            data: { name: 'MUST-NOT-CREATE-AFTER-DEMOTION', type: 'team' },
          },
        );
        expect(deniedCreate.status(), 'Demoted user must not create groups').toBe(403);
        const deniedEdit = await employee.patch(
          '/api/backend/companies/' + companyId + '/groups/' + requiredFixture('E2E_B2B_GROUP_A_ID'),
          {
            headers: { origin },
            data: { name: 'MUST-NOT-EDIT-AFTER-DEMOTION' },
          },
        );
        expect(deniedEdit.status(), 'Demoted user must not edit groups').toBe(403);

        // A demoted administrator's old GroupMembership.superuser must never
        // bypass the canonical CompanyMembership.member restriction.
        for (const role of ['manager', 'employee']) {
          const forbiddenInvite = await employee.post(
            '/api/backend/companies/' + companyId + '/invites',
            {
              headers: { origin },
              data: {
                inviteeEmail: 'must-not-invite-after-demotion@invalid.example',
                groupId: requiredFixture('E2E_B2B_GROUP_A_ID'),
                role,
              },
            },
          );
          expect(forbiddenInvite.status(), 'Demoted user must not invite ' + role).toBe(403);
        }
      }
      await admin.dispose();
      await employee.dispose();
    }
  });

  test('the final company administrator cannot demote themselves', async ({ baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const companyId = requiredFixture('E2E_B2B_COMPANY_B_ID');
    const adminUserId = requiredFixture('E2E_B2B_B_ADMIN_USER_ID');
    const admin = await playwrightRequest.newContext({
      baseURL,
      storageState: stateFiles.companyBAdmin,
    });
    try {
      const before = await admin.get('/api/auth/session');
      expect(before.status()).toBe(200);
      expect(await before.json()).toEqual(
        expect.objectContaining({ id: adminUserId, companyId, companyRole: 'superuser' }),
      );

      const refused = await admin.patch(rolesUrl(companyId, adminUserId), {
        headers: { origin },
        data: { companyRole: 'employee' },
      });
      expect(refused.status()).toBe(409);

      const after = await admin.get('/api/auth/session');
      expect(after.status()).toBe(200);
      expect(await after.json()).toEqual(
        expect.objectContaining({ id: adminUserId, companyId, companyRole: 'superuser' }),
      );
    } finally {
      await admin.dispose();
    }
  });
});
