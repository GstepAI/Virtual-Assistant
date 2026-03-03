interface ClientPrincipalClaim {
  typ?: string;
  val?: string;
}

export interface ClientPrincipal {
  identityProvider?: string;
  userId?: string;
  userDetails?: string;
  userRoles?: string[];
  claims?: ClientPrincipalClaim[];
}

function getHeader(req: any, key: string): string | undefined {
  if (!req?.headers) {
    return undefined;
  }

  const lowerKey = key.toLowerCase();
  const headerEntry = Object.entries(req.headers).find(
    ([headerName]) => headerName.toLowerCase() === lowerKey
  );

  if (!headerEntry) {
    return undefined;
  }

  const [, value] = headerEntry;
  if (Array.isArray(value)) {
    return value[0];
  }

  return typeof value === 'string' ? value : undefined;
}

function parseCsvSet(raw: string | undefined): Set<string> {
  if (!raw) {
    return new Set();
  }

  return new Set(
    raw
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
  );
}

function normalizeRoles(principal: ClientPrincipal | null): Set<string> {
  if (!principal?.userRoles) {
    return new Set();
  }

  return new Set(principal.userRoles.map((role) => role.toLowerCase()));
}

function isDevBypassAuthorized(req: any): boolean {
  const bypassEnabled = process.env.ADMIN_DEV_BYPASS === 'true';
  if (!bypassEnabled) {
    return false;
  }

  const expectedKey = process.env.ADMIN_DEV_KEY;
  if (!expectedKey) {
    return false;
  }

  const providedKey = getHeader(req, 'x-admin-dev-key');
  return providedKey === expectedKey;
}

function isAuthDisabled(): boolean {
  return process.env.ADMIN_DISABLE_AUTH === 'true';
}

export function getClientPrincipal(req: any): ClientPrincipal | null {
  const encodedPrincipal = getHeader(req, 'x-ms-client-principal');
  if (!encodedPrincipal) {
    return null;
  }

  try {
    const decoded = Buffer.from(encodedPrincipal, 'base64').toString('utf8');
    const principal = JSON.parse(decoded) as ClientPrincipal;
    return principal;
  } catch {
    return null;
  }
}

export function isAuthenticated(principal: ClientPrincipal | null): boolean {
  if (!principal) {
    return false;
  }

  const roles = normalizeRoles(principal);
  return roles.has('authenticated');
}

export function isAdminAuthorized(req: any): boolean {
  if (isAuthDisabled()) {
    return true;
  }

  if (isDevBypassAuthorized(req)) {
    return true;
  }

  const principal = getClientPrincipal(req);
  if (!principal) {
    return false;
  }

  const roles = normalizeRoles(principal);
  if (roles.has('admin')) {
    return true;
  }

  const allowAllAuthenticated = process.env.ADMIN_ALLOW_ALL_AUTHENTICATED === 'true';
  if (allowAllAuthenticated && roles.has('authenticated')) {
    return true;
  }

  const allowedEmails = parseCsvSet(process.env.ADMIN_ALLOWED_EMAILS);
  const userEmail = principal.userDetails?.trim().toLowerCase();
  if (userEmail && allowedEmails.has(userEmail)) {
    return true;
  }

  return false;
}

export function requireAdmin(context: any, req: any): boolean {
  if (isAuthDisabled()) {
    return true;
  }

  if (isAdminAuthorized(req)) {
    return true;
  }

  context.res = {
    status: 403,
    body: {
      error: 'Admin access required',
      hint: 'Sign in with Microsoft Entra ID and ensure your account has admin role/allowlist access.',
    },
  };
  return false;
}
