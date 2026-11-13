export const SALES_ROLES = Object.freeze(['admin', 'saleshead', 'sales']);

export function isSalesRole(role) { return SALES_ROLES.includes(role); }
export function canManageSalesUsers(user) { return ['admin', 'saleshead'].includes(user?.role); }
export function canReadSalesUser(user, target) {
  return user?.role === 'admin' || (user?.role === 'saleshead' && target?.role === 'sales');
}
export function canCreateSalesUser(user, requestedRole) {
  return isSalesRole(requestedRole)
    && (user?.role === 'admin' || (user?.role === 'saleshead' && requestedRole === 'sales'));
}
export function canEditSalesUser(user) { return user?.role === 'admin'; }
export function isActiveSalesAccount(user) { return user?.role === 'sales' && user.isActive === true; }

// Profile requests may change contact details, never account privileges.
export function ownProfilePrivileges(user) {
  return { role: user.role, isActive: user.isActive };
}
