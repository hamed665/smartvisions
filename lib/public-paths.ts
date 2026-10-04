const publicShellPrefixes = ['/login', '/auth', '/invite', '/p'] as const;

export function isPublicShellPath(pathname: string) {
  return publicShellPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
