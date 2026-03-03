"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientPrincipal = getClientPrincipal;
exports.isAuthenticated = isAuthenticated;
exports.isAdminAuthorized = isAdminAuthorized;
exports.requireAdmin = requireAdmin;
function getHeader(req, key) {
    if (!(req === null || req === void 0 ? void 0 : req.headers)) {
        return undefined;
    }
    const lowerKey = key.toLowerCase();
    const headerEntry = Object.entries(req.headers).find(([headerName]) => headerName.toLowerCase() === lowerKey);
    if (!headerEntry) {
        return undefined;
    }
    const [, value] = headerEntry;
    if (Array.isArray(value)) {
        return value[0];
    }
    return typeof value === 'string' ? value : undefined;
}
function parseCsvSet(raw) {
    if (!raw) {
        return new Set();
    }
    return new Set(raw
        .split(',')
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean));
}
function normalizeRoles(principal) {
    if (!(principal === null || principal === void 0 ? void 0 : principal.userRoles)) {
        return new Set();
    }
    return new Set(principal.userRoles.map((role) => role.toLowerCase()));
}
function isDevBypassAuthorized(req) {
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
function isAuthDisabled() {
    return process.env.ADMIN_DISABLE_AUTH === 'true';
}
function getClientPrincipal(req) {
    const encodedPrincipal = getHeader(req, 'x-ms-client-principal');
    if (!encodedPrincipal) {
        return null;
    }
    try {
        const decoded = Buffer.from(encodedPrincipal, 'base64').toString('utf8');
        const principal = JSON.parse(decoded);
        return principal;
    }
    catch {
        return null;
    }
}
function isAuthenticated(principal) {
    if (!principal) {
        return false;
    }
    const roles = normalizeRoles(principal);
    return roles.has('authenticated');
}
function isAdminAuthorized(req) {
    var _a;
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
    const userEmail = (_a = principal.userDetails) === null || _a === void 0 ? void 0 : _a.trim().toLowerCase();
    if (userEmail && allowedEmails.has(userEmail)) {
        return true;
    }
    return false;
}
function requireAdmin(context, req) {
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
