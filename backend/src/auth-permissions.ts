import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access';

const statement = {
  ...defaultStatements,
} as const;

export const authAccess = createAccessControl(statement);

export const ownerRole = authAccess.newRole({
  ...adminAc.statements,
});

export const adminRole = authAccess.newRole({});
export const userRole = authAccess.newRole({});
