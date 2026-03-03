"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeFileName = sanitizeFileName;
exports.sanitizePathSegment = sanitizePathSegment;
exports.buildSlideMediaPath = buildSlideMediaPath;
exports.buildGeneralMediaPath = buildGeneralMediaPath;
function sanitizeFileName(fileName) {
    const sanitized = fileName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-_.]+|[-_.]+$/g, '');
    return sanitized || `asset-${Date.now()}`;
}
function sanitizePathSegment(value, fallback) {
    const sanitized = value
        .trim()
        .replace(/[\\/]+/g, '-')
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-_.]+|[-_.]+$/g, '');
    return sanitized || fallback;
}
function buildSlideMediaPath(params) {
    const timestamp = Number.isFinite(params.timestamp) && Number(params.timestamp) > 0
        ? Math.floor(Number(params.timestamp))
        : Date.now();
    const category = sanitizePathSegment(params.category, 'Uncategorized');
    const slideId = sanitizePathSegment(params.slideId, 'slide');
    const safeName = sanitizeFileName(params.fileName);
    return `${category}/${params.mediaType}/${slideId}_${timestamp}_${safeName}`;
}
function buildGeneralMediaPath(params) {
    const timestamp = Number.isFinite(params.timestamp) && Number(params.timestamp) > 0
        ? Math.floor(Number(params.timestamp))
        : Date.now();
    const safeName = sanitizeFileName(params.fileName);
    const date = new Date(timestamp);
    const year = String(date.getUTCFullYear());
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const suffix = sanitizePathSegment(params.randomSuffix || 'upload', 'upload').toLowerCase();
    return `uploads/${params.mediaType}/${year}/${month}/${timestamp}-${suffix}-${safeName}`;
}
