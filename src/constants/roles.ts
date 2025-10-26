// Role definitions and labels
export const ROLES = {
  ADMIN: 'admin',
  MAINTAINER: 'maintainer',
  USER: 'user',
} as const;

export const ROLE_LABELS: Record<string, string> = {
  [ROLES.ADMIN]: '管理者',
  [ROLES.MAINTAINER]: 'メンテナー',
  [ROLES.USER]: '一般ユーザー',
};

export const AVAILABLE_ROLES = [
  ROLES.ADMIN,
  ROLES.MAINTAINER,
  ROLES.USER,
] as const;

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] || role;
}

export function hasManagementAccess(roles: string[]): boolean {
  return roles.includes(ROLES.ADMIN) || roles.includes(ROLES.MAINTAINER);
}
