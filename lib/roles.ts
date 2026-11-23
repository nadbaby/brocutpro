export type UserRole = 'admin' | 'user';

export interface UserRoleProfile {
  email: string;
  name: string;
  displayName: string;
  role: UserRole;
  isAdmin: boolean;
  canAddInventory: boolean;
  canEditInventory: boolean;
  canDeleteInventory: boolean;
  canBulkImport: boolean;
  canManageCategories: boolean;
  canCreateCuts: boolean;
  canViewInventory: boolean;
  canExportData: boolean;
}

export const ADMIN_EMAILS: string[] = [
  'dipanshu@pvtchopra.com',
  'admin@pvtchopra.com'
];

export const REGULAR_USERS: Record<string, { name: string }> = {
  'bhawna@pvtchopra.com': { name: 'Bhawna' },
  'roshini@pvtchopra.com': { name: 'Roshini' },
  'suman@pvtchopra.com': { name: 'Suman' },
  'rajwant@pvtchopra.com': { name: 'Rajwant' },
  'mamta@pvtchopra.com': { name: 'Mamta' },
};

export function getUserRoleProfile(emailRaw?: string | null): UserRoleProfile {
  const email = String(emailRaw || '').toLowerCase().trim();
  const isAdmin = ADMIN_EMAILS.some(adminEmail => adminEmail.toLowerCase() === email);

  let name = 'Operator';
  if (isAdmin) {
    name = 'Dipanshu';
  } else if (REGULAR_USERS[email]) {
    name = REGULAR_USERS[email].name;
  } else if (email.includes('bhawna')) {
    name = 'Bhawna';
  } else if (email.includes('roshini') || email.includes('roshni')) {
    name = 'Roshini';
  } else if (email.includes('suman')) {
    name = 'Suman';
  } else if (email.includes('rajwant')) {
    name = 'Rajwant';
  } else if (email.includes('mamta')) {
    name = 'Mamta';
  } else if (email) {
    const prefix = email.split('@')[0].replace(/[._\d]/g, ' ').trim();
    name = prefix ? (prefix.charAt(0).toUpperCase() + prefix.slice(1)) : 'Operator';
  }

  return {
    email,
    name,
    displayName: name,
    role: isAdmin ? 'admin' : 'user',
    isAdmin,
    canAddInventory: isAdmin,
    canEditInventory: isAdmin,
    canDeleteInventory: isAdmin,
    canBulkImport: isAdmin,
    canManageCategories: isAdmin,
    canCreateCuts: true,
    canViewInventory: true,
    canExportData: true
  };
}
