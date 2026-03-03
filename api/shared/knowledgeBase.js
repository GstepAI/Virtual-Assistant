"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isKnowledgeBaseTag = isKnowledgeBaseTag;
exports.normalizeKnowledgeBaseTag = normalizeKnowledgeBaseTag;
exports.isAllowedKnowledgeBaseFile = isAllowedKnowledgeBaseFile;
exports.resolveKnowledgeBaseContentType = resolveKnowledgeBaseContentType;
exports.buildKnowledgeBaseBlobPath = buildKnowledgeBaseBlobPath;
exports.encodeKnowledgeBaseDocumentId = encodeKnowledgeBaseDocumentId;
exports.decodeKnowledgeBaseDocumentId = decodeKnowledgeBaseDocumentId;
const KNOWLEDGE_BASE_TAGS = [
    'funds',
    'about',
    'general',
    'golden-visa',
];
const ALLOWED_KNOWLEDGE_BASE_EXTENSIONS = new Set([
    '.pdf',
    '.docx',
    '.ppt',
    '.pptx',
]);
const ALLOWED_KNOWLEDGE_BASE_CONTENT_TYPES = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/octet-stream',
]);
const EXTENSION_CONTENT_TYPE_MAP = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
function sanitizeFileName(fileName) {
    const sanitized = fileName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-_.]+|[-_.]+$/g, '');
    return sanitized || `document-${Date.now()}`;
}
function normalizeTag(value) {
    return value.trim().toLowerCase();
}
function getFileExtension(fileName) {
    const normalized = fileName.trim().toLowerCase();
    const index = normalized.lastIndexOf('.');
    if (index <= 0 || index === normalized.length - 1) {
        return '';
    }
    return normalized.slice(index);
}
function normalizeContentType(contentType) {
    return contentType.trim().toLowerCase();
}
function isKnowledgeBaseTag(value) {
    return KNOWLEDGE_BASE_TAGS.includes(normalizeTag(value));
}
function normalizeKnowledgeBaseTag(value) {
    const normalized = normalizeTag(value);
    return isKnowledgeBaseTag(normalized) ? normalized : null;
}
function isAllowedKnowledgeBaseFile(fileName, contentType) {
    const extension = getFileExtension(fileName);
    if (!ALLOWED_KNOWLEDGE_BASE_EXTENSIONS.has(extension)) {
        return false;
    }
    const normalizedType = normalizeContentType(contentType);
    if (!normalizedType) {
        return true;
    }
    return ALLOWED_KNOWLEDGE_BASE_CONTENT_TYPES.has(normalizedType);
}
function resolveKnowledgeBaseContentType(fileName, providedContentType) {
    const normalizedProvided = normalizeContentType(providedContentType);
    if (normalizedProvided &&
        normalizedProvided !== 'application/octet-stream' &&
        ALLOWED_KNOWLEDGE_BASE_CONTENT_TYPES.has(normalizedProvided)) {
        return normalizedProvided;
    }
    const extension = getFileExtension(fileName);
    return EXTENSION_CONTENT_TYPE_MAP[extension] || 'application/octet-stream';
}
function buildKnowledgeBaseBlobPath(tag, fileName, timestamp = Date.now()) {
    const safeName = sanitizeFileName(fileName);
    const safeTimestamp = Number.isFinite(timestamp) ? Math.floor(timestamp) : Date.now();
    return `knowledge-base/${tag}/${safeTimestamp}_${safeName}`;
}
function encodeKnowledgeBaseDocumentId(blobPath) {
    return Buffer.from(blobPath, 'utf8').toString('base64url');
}
function decodeKnowledgeBaseDocumentId(id) {
    try {
        const decoded = Buffer.from(id, 'base64url').toString('utf8');
        const normalized = decoded.trim().replace(/\\/g, '/').replace(/^\/+/, '');
        if (!normalized || normalized.includes('..')) {
            return null;
        }
        return normalized;
    }
    catch {
        return null;
    }
}
