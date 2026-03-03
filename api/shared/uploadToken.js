"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.issueUploadToken = issueUploadToken;
exports.verifyUploadToken = verifyUploadToken;
const crypto_1 = __importDefault(require("crypto"));
function getSigningSecret() {
    return process.env.MEDIA_UPLOAD_SECRET || 'local-dev-only-secret-change-me';
}
function base64UrlEncode(value) {
    return Buffer.from(value, 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}
function base64UrlDecode(value) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '==='.slice((normalized.length + 3) % 4);
    return Buffer.from(padded, 'base64').toString('utf8');
}
function sign(value) {
    return crypto_1.default
        .createHmac('sha256', getSigningSecret())
        .update(value)
        .digest('hex');
}
function issueUploadToken(relativePath, contentType, ttlSeconds = 300, options = {}) {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const payload = {
        relativePath,
        contentType,
        expiresAt,
    };
    if (Number.isFinite(options.maxBytes) && Number(options.maxBytes) > 0) {
        payload.maxBytes = Math.floor(Number(options.maxBytes));
    }
    if (options.mediaType === 'images' || options.mediaType === 'videos') {
        payload.mediaType = options.mediaType;
    }
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signature = sign(encodedPayload);
    return {
        token: `${encodedPayload}.${signature}`,
        expiresAt: new Date(expiresAt).toISOString(),
    };
}
function verifyUploadToken(token) {
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) {
        return { valid: false, reason: 'Malformed upload token' };
    }
    const expectedSignature = sign(encodedPayload);
    if (signature.length !== expectedSignature.length) {
        return { valid: false, reason: 'Invalid upload token signature' };
    }
    if (!crypto_1.default.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expectedSignature, 'utf8'))) {
        return { valid: false, reason: 'Invalid upload token signature' };
    }
    try {
        const decodedPayload = base64UrlDecode(encodedPayload);
        const payload = JSON.parse(decodedPayload);
        if (!payload ||
            typeof payload.relativePath !== 'string' ||
            typeof payload.contentType !== 'string' ||
            typeof payload.expiresAt !== 'number') {
            return { valid: false, reason: 'Invalid upload token payload' };
        }
        if (payload.maxBytes !== undefined &&
            (!Number.isFinite(payload.maxBytes) || payload.maxBytes <= 0)) {
            return { valid: false, reason: 'Invalid upload token payload' };
        }
        if (payload.mediaType !== undefined &&
            payload.mediaType !== 'images' &&
            payload.mediaType !== 'videos') {
            return { valid: false, reason: 'Invalid upload token payload' };
        }
        if (Date.now() > payload.expiresAt) {
            return { valid: false, reason: 'Upload token has expired' };
        }
        return { valid: true, payload };
    }
    catch {
        return { valid: false, reason: 'Invalid upload token payload' };
    }
}
