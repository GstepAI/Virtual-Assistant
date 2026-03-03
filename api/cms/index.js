"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;
const crypto_1 = __importDefault(require("crypto"));
const contentStore_1 = require("../shared/contentStore");
const auth_1 = require("../shared/auth");
const uploadToken_1 = require("../shared/uploadToken");
const blobStorage_1 = require("../shared/blobStorage");
const mediaUploadPath_1 = require("../shared/mediaUploadPath");
const knowledgeBase_1 = require("../shared/knowledgeBase");
const IMAGE_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
]);
const VIDEO_TYPES = new Set([
    'video/mp4',
    'video/webm',
]);
const KNOWLEDGE_BASE_UPLOAD_MAX_MB = 50;
function jsonResponse(context, status, body) {
    context.res = { status, body };
}
function parsePositiveInt(raw, fallback) {
    const parsed = Number.parseInt(raw || '', 10);
    if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
    }
    return fallback;
}
function normalizeContentType(contentType) {
    return contentType.trim().toLowerCase();
}
function getMaxUploadMb(mediaType) {
    const fallback = parsePositiveInt(process.env.MEDIA_UPLOAD_MAX_MB, 25);
    if (mediaType === 'images') {
        return parsePositiveInt(process.env.MEDIA_UPLOAD_MAX_IMAGE_MB, fallback);
    }
    return parsePositiveInt(process.env.MEDIA_UPLOAD_MAX_VIDEO_MB, fallback);
}
function getMaxUploadBytes(mediaType) {
    return getMaxUploadMb(mediaType) * 1024 * 1024;
}
function getKnowledgeBaseMaxUploadBytes() {
    const maxMb = parsePositiveInt(process.env.KNOWLEDGE_BASE_UPLOAD_MAX_MB, KNOWLEDGE_BASE_UPLOAD_MAX_MB);
    return maxMb * 1024 * 1024;
}
function safeFileNameForHeader(fileName) {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}
function validateSlideForCreate(slide) {
    if (!slide || typeof slide !== 'object') {
        return 'Slide payload is required';
    }
    if (!slide.id || typeof slide.id !== 'string') {
        return 'Slide id is required';
    }
    if (!slide.title || typeof slide.title !== 'string') {
        return 'Slide title is required';
    }
    if (!slide.imageUrl || typeof slide.imageUrl !== 'string') {
        return 'Slide imageUrl is required';
    }
    if (!slide.description || typeof slide.description !== 'string') {
        return 'Slide description is required';
    }
    const script = slide.pitchScript;
    if (!script || typeof script !== 'object') {
        return 'Slide pitchScript is required';
    }
    if (typeof script['en-US'] !== 'string' ||
        typeof script['en-UK'] !== 'string' ||
        typeof script['pt-BR'] !== 'string') {
        return 'pitchScript must include en-US, en-UK, and pt-BR strings';
    }
    return null;
}
function validateRoomForCreate(room) {
    if (!room || typeof room !== 'object') {
        return 'Room payload is required';
    }
    if (!room.roomId || typeof room.roomId !== 'string') {
        return 'roomId is required';
    }
    if (!room.name || typeof room.name !== 'string') {
        return 'name is required';
    }
    if (!room.description || typeof room.description !== 'string') {
        return 'description is required';
    }
    if (!Array.isArray(room.slideSequence)) {
        return 'slideSequence must be an array';
    }
    return null;
}
function parseVersionNumber(raw) {
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
        return Math.floor(raw);
    }
    if (typeof raw === 'string') {
        const parsed = Number.parseInt(raw.trim(), 10);
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return null;
}
function normalizePublishPayload(rawStore) {
    var _a, _b, _c;
    if (!rawStore || typeof rawStore !== 'object') {
        throw new Error('Invalid staging content store: root payload must be an object.');
    }
    if (Array.isArray(rawStore.slides) && Array.isArray(rawStore.rooms)) {
        const version = (_b = (_a = parseVersionNumber(rawStore.version)) !== null && _a !== void 0 ? _a : parseVersionNumber(rawStore.publishedVersion)) !== null && _b !== void 0 ? _b : 1;
        return {
            slides: rawStore.slides,
            rooms: rawStore.rooms,
            version,
        };
    }
    const draftSnapshot = rawStore.draft;
    if (draftSnapshot &&
        typeof draftSnapshot === 'object' &&
        Array.isArray(draftSnapshot.slides) &&
        Array.isArray(draftSnapshot.rooms)) {
        const version = (_c = parseVersionNumber(rawStore.publishedVersion)) !== null && _c !== void 0 ? _c : 1;
        return {
            slides: draftSnapshot.slides,
            rooms: draftSnapshot.rooms,
            version,
        };
    }
    throw new Error('Invalid staging content store: expected slides/rooms arrays in live or legacy draft shape.');
}
function isAllowedContentType(mediaType, contentType) {
    const normalized = normalizeContentType(contentType);
    if (mediaType === 'images') {
        return IMAGE_TYPES.has(normalized);
    }
    return VIDEO_TYPES.has(normalized);
}
async function triggerIndexerRefresh() {
    const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT;
    const searchApiKey = process.env.AZURE_SEARCH_API_KEY;
    const indexerName = process.env.AZURE_SEARCH_INDEXER_NAME;
    if (!searchEndpoint || !searchApiKey || !indexerName) {
        return {
            ok: false,
            details: 'AZURE_SEARCH_ENDPOINT, AZURE_SEARCH_API_KEY, and AZURE_SEARCH_INDEXER_NAME are required',
        };
    }
    const baseUrl = searchEndpoint.replace(/\/+$/, '');
    const encodedIndexer = encodeURIComponent(indexerName);
    const runUrl = `${baseUrl}/indexers('${encodedIndexer}')/run?api-version=2024-07-01`;
    const response = await fetch(runUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key': searchApiKey,
        },
    });
    if (!response.ok) {
        const text = await response.text();
        return {
            ok: false,
            details: `Indexer trigger failed (${response.status}): ${text}`,
        };
    }
    return {
        ok: true,
        details: `Indexer "${indexerName}" trigger accepted`,
    };
}
async function handleUploadUrl(context, req) {
    const { fileName, contentType: rawContentType, mediaType: rawMediaType = 'images', slideId, category, uploadContext = 'general', } = req.body || {};
    if (!(0, blobStorage_1.isBlobStorageConfigured)()) {
        jsonResponse(context, 500, {
            error: 'Media upload storage is not configured',
            hint: (0, blobStorage_1.getBlobStorageConfigHint)(),
        });
        return;
    }
    if (!fileName || typeof fileName !== 'string') {
        jsonResponse(context, 400, { error: 'fileName is required' });
        return;
    }
    if (!rawContentType || typeof rawContentType !== 'string') {
        jsonResponse(context, 400, { error: 'contentType is required' });
        return;
    }
    const mediaType = rawMediaType === 'images' || rawMediaType === 'videos' ? rawMediaType : null;
    if (!mediaType) {
        jsonResponse(context, 400, { error: 'mediaType must be "images" or "videos"' });
        return;
    }
    const contentType = normalizeContentType(rawContentType);
    if (!isAllowedContentType(mediaType, contentType)) {
        jsonResponse(context, 400, {
            error: `contentType "${contentType}" is not allowed for mediaType "${mediaType}"`,
        });
        return;
    }
    const timestamp = Date.now();
    const isSlideUpload = uploadContext === 'slide';
    let filePath = '';
    if (isSlideUpload) {
        if (!slideId || typeof slideId !== 'string' || !slideId.trim()) {
            jsonResponse(context, 400, { error: 'slideId is required for slide uploads' });
            return;
        }
        if (!category || typeof category !== 'string' || !category.trim()) {
            jsonResponse(context, 400, { error: 'category is required for slide uploads' });
            return;
        }
        filePath = (0, mediaUploadPath_1.buildSlideMediaPath)({
            category,
            mediaType,
            slideId,
            fileName,
            timestamp,
        });
    }
    else {
        filePath = (0, mediaUploadPath_1.buildGeneralMediaPath)({
            mediaType,
            fileName,
            timestamp,
            randomSuffix: crypto_1.default.randomUUID().slice(0, 8),
        });
    }
    const ttlSeconds = Number.parseInt(process.env.MEDIA_UPLOAD_TTL_SECONDS || '300', 10);
    const maxBytes = getMaxUploadBytes(mediaType);
    const tokenPayload = (0, uploadToken_1.issueUploadToken)(filePath, contentType, ttlSeconds, {
        maxBytes,
        mediaType,
    });
    jsonResponse(context, 200, {
        uploadUrl: '/api/cms/media/upload',
        token: tokenPayload.token,
        expiresAt: tokenPayload.expiresAt,
        assetUrl: filePath,
        maxBytes,
        method: 'POST',
        mode: 'signed-blob-upload',
    });
}
async function handleUpload(context, req) {
    var _a, _b;
    const { token, base64Data, contentType: rawContentType } = req.body || {};
    if (!token || typeof token !== 'string') {
        jsonResponse(context, 400, { error: 'token is required' });
        return;
    }
    if (!base64Data || typeof base64Data !== 'string') {
        jsonResponse(context, 400, { error: 'base64Data is required' });
        return;
    }
    if (!rawContentType || typeof rawContentType !== 'string') {
        jsonResponse(context, 400, { error: 'contentType is required' });
        return;
    }
    const contentType = normalizeContentType(rawContentType);
    const verification = (0, uploadToken_1.verifyUploadToken)(token);
    if (verification.valid === false) {
        jsonResponse(context, 400, { error: verification.reason });
        return;
    }
    if (normalizeContentType(verification.payload.contentType) !== contentType) {
        jsonResponse(context, 400, {
            error: 'contentType does not match the signed upload token',
        });
        return;
    }
    const mediaType = verification.payload.mediaType ||
        (contentType.startsWith('video/') ? 'videos' : 'images');
    if (!isAllowedContentType(mediaType, contentType)) {
        jsonResponse(context, 400, {
            error: `contentType "${contentType}" is not allowed for mediaType "${mediaType}"`,
        });
        return;
    }
    const binary = Buffer.from(base64Data, 'base64');
    const maxBytes = verification.payload.maxBytes || getMaxUploadBytes(mediaType);
    if (binary.byteLength > maxBytes) {
        const maxMb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
        jsonResponse(context, 413, {
            error: `File too large. Max size is ${maxMb}MB.`,
        });
        return;
    }
    if (!(0, blobStorage_1.isBlobStorageConfigured)()) {
        jsonResponse(context, 500, {
            error: 'Media upload storage is not configured',
            hint: (0, blobStorage_1.getBlobStorageConfigHint)(),
        });
        return;
    }
    const uploadResult = await (0, blobStorage_1.uploadMediaBlob)(verification.payload.relativePath, binary, contentType);
    (_b = (_a = context.log) === null || _a === void 0 ? void 0 : _a.info) === null || _b === void 0 ? void 0 : _b.call(_a, '[admin] media upload complete', {
        path: verification.payload.relativePath,
        mediaType,
        bytes: binary.byteLength,
    });
    jsonResponse(context, 200, {
        message: 'Upload complete',
        assetUrl: uploadResult.assetUrl,
        blobUrl: uploadResult.blobUrl,
        bytes: binary.byteLength,
    });
}
async function handleKnowledgeBaseList(context) {
    if (!(0, blobStorage_1.isBlobStorageConfigured)()) {
        jsonResponse(context, 500, {
            error: 'Knowledge base storage is not configured',
            hint: (0, blobStorage_1.getBlobStorageConfigHint)(),
        });
        return;
    }
    const blobs = await (0, blobStorage_1.listKnowledgeBaseBlobs)();
    const documents = blobs.map((blob) => {
        const metadata = blob.metadata || {};
        const tag = (0, knowledgeBase_1.normalizeKnowledgeBaseTag)(metadata.tag || '') || 'general';
        const uploadedAt = metadata.uploadedat || blob.lastModified;
        const uploadedBy = metadata.uploadedby || '';
        const description = metadata.description || '';
        const id = (0, knowledgeBase_1.encodeKnowledgeBaseDocumentId)(blob.blobPath);
        return {
            id,
            fileName: blob.fileName,
            description,
            tag,
            uploadedAt,
            uploadedBy,
            sizeBytes: blob.sizeBytes,
            contentType: blob.contentType,
            openUrl: `/api/cms/knowledge-base/${encodeURIComponent(id)}/open`,
        };
    });
    documents.sort((a, b) => {
        const byDate = new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
        if (byDate !== 0) {
            return byDate;
        }
        return a.fileName.localeCompare(b.fileName);
    });
    jsonResponse(context, 200, { documents });
}
async function handleKnowledgeBaseUpload(context, req) {
    var _a, _b;
    if (!(0, blobStorage_1.isBlobStorageConfigured)()) {
        jsonResponse(context, 500, {
            error: 'Knowledge base storage is not configured',
            hint: (0, blobStorage_1.getBlobStorageConfigHint)(),
        });
        return;
    }
    const { fileName, contentType: rawContentType, base64Data, description, tag, } = req.body || {};
    if (!fileName || typeof fileName !== 'string') {
        jsonResponse(context, 400, { error: 'fileName is required' });
        return;
    }
    if (!rawContentType || typeof rawContentType !== 'string') {
        jsonResponse(context, 400, { error: 'contentType is required' });
        return;
    }
    if (!base64Data || typeof base64Data !== 'string') {
        jsonResponse(context, 400, { error: 'base64Data is required' });
        return;
    }
    if (!description || typeof description !== 'string' || !description.trim()) {
        jsonResponse(context, 400, { error: 'description is required' });
        return;
    }
    if (!tag || typeof tag !== 'string') {
        jsonResponse(context, 400, { error: 'tag is required' });
        return;
    }
    const normalizedTag = (0, knowledgeBase_1.normalizeKnowledgeBaseTag)(tag);
    if (!normalizedTag) {
        jsonResponse(context, 400, {
            error: 'tag must be one of: funds, about, general, golden-visa',
        });
        return;
    }
    if (!(0, knowledgeBase_1.isAllowedKnowledgeBaseFile)(fileName, rawContentType)) {
        jsonResponse(context, 400, {
            error: 'Only PDF, DOCX, PPT, and PPTX files are supported.',
        });
        return;
    }
    const binary = Buffer.from(base64Data, 'base64');
    const maxBytes = getKnowledgeBaseMaxUploadBytes();
    if (binary.byteLength > maxBytes) {
        const maxMb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
        jsonResponse(context, 413, {
            error: `File too large. Max size is ${maxMb}MB.`,
        });
        return;
    }
    const contentType = (0, knowledgeBase_1.resolveKnowledgeBaseContentType)(fileName, rawContentType);
    const timestamp = Date.now();
    const blobPath = (0, knowledgeBase_1.buildKnowledgeBaseBlobPath)(normalizedTag, fileName, timestamp);
    const principal = (0, auth_1.getClientPrincipal)(req);
    const uploadedBy = (principal === null || principal === void 0 ? void 0 : principal.userDetails) || (principal === null || principal === void 0 ? void 0 : principal.userId) || 'admin';
    const uploadedAt = new Date(timestamp).toISOString();
    const uploadResult = await (0, blobStorage_1.uploadKnowledgeBaseBlob)(blobPath, binary, contentType, {
        description: description.trim(),
        tag: normalizedTag,
        uploadedby: uploadedBy,
        uploadedat: uploadedAt,
    });
    const id = (0, knowledgeBase_1.encodeKnowledgeBaseDocumentId)(uploadResult.blobPath);
    (_b = (_a = context.log) === null || _a === void 0 ? void 0 : _a.info) === null || _b === void 0 ? void 0 : _b.call(_a, '[admin] knowledge-base upload complete', {
        path: uploadResult.blobPath,
        bytes: binary.byteLength,
        tag: normalizedTag,
    });
    jsonResponse(context, 201, {
        message: 'Knowledge base document uploaded',
        document: {
            id,
            fileName: fileName.trim(),
            description: description.trim(),
            tag: normalizedTag,
            uploadedAt,
            uploadedBy,
            sizeBytes: binary.byteLength,
            contentType,
            openUrl: `/api/cms/knowledge-base/${encodeURIComponent(id)}/open`,
        },
    });
}
async function handleKnowledgeBaseOpen(context, id) {
    if (!id) {
        jsonResponse(context, 400, { error: 'Document id is required' });
        return;
    }
    const blobPath = (0, knowledgeBase_1.decodeKnowledgeBaseDocumentId)(id);
    if (!blobPath) {
        jsonResponse(context, 400, { error: 'Invalid document id' });
        return;
    }
    try {
        const payload = await (0, blobStorage_1.downloadKnowledgeBaseBlob)(blobPath);
        context.res = {
            status: 200,
            body: payload.binary,
            isRaw: true,
            headers: {
                'Content-Type': payload.contentType,
                'Content-Length': String(payload.binary.length),
                'Content-Disposition': `inline; filename="${safeFileNameForHeader(payload.fileName)}"`,
                'Cache-Control': 'no-store',
            },
        };
    }
    catch (error) {
        const status = (error === null || error === void 0 ? void 0 : error.statusCode) === 404 || (error === null || error === void 0 ? void 0 : error.code) === 'BlobNotFound' ? 404 : 500;
        jsonResponse(context, status, {
            error: status === 404 ? 'Document not found' : 'Failed to open document',
        });
    }
}
async function handleKnowledgeBaseDelete(context, id) {
    var _a, _b;
    if (!id) {
        jsonResponse(context, 400, { error: 'Document id is required' });
        return;
    }
    const blobPath = (0, knowledgeBase_1.decodeKnowledgeBaseDocumentId)(id);
    if (!blobPath) {
        jsonResponse(context, 400, { error: 'Invalid document id' });
        return;
    }
    const deleted = await (0, blobStorage_1.deleteKnowledgeBaseBlob)(blobPath);
    if (!deleted) {
        jsonResponse(context, 404, { error: 'Document not found' });
        return;
    }
    (_b = (_a = context.log) === null || _a === void 0 ? void 0 : _a.info) === null || _b === void 0 ? void 0 : _b.call(_a, '[admin] knowledge-base document deleted', {
        path: blobPath,
    });
    jsonResponse(context, 200, { message: 'Knowledge base document deleted', id });
}
async function default_1(context, req) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const entity = (((_a = req.params) === null || _a === void 0 ? void 0 : _a.entity) || '').toLowerCase();
    const id = (_b = req.params) === null || _b === void 0 ? void 0 : _b.id;
    const action = (((_c = req.params) === null || _c === void 0 ? void 0 : _c.action) || '').toLowerCase();
    if (entity === 'me' && req.method === 'GET') {
        const principal = (0, auth_1.getClientPrincipal)(req);
        jsonResponse(context, 200, {
            principal,
            hasPrincipal: !!principal,
        });
        return;
    }
    if (!(0, auth_1.requireAdmin)(context, req)) {
        return;
    }
    try {
        if (req.method === 'GET') {
            if (entity === 'knowledge-base' && !id) {
                await handleKnowledgeBaseList(context);
                return;
            }
            if (entity === 'knowledge-base' && id && action === 'open') {
                await handleKnowledgeBaseOpen(context, id);
                return;
            }
            if (entity === 'content') {
                const store = await (0, contentStore_1.loadStore)();
                const summary = await (0, contentStore_1.getStoreSummary)();
                jsonResponse(context, 200, {
                    summary,
                    content: {
                        version: store.version,
                        updatedAt: store.updatedAt,
                        slides: store.slides,
                        rooms: store.rooms,
                        roomConfigVersion: store.roomConfigVersion,
                        roomConfigLastUpdated: store.roomConfigLastUpdated,
                    },
                });
                return;
            }
            if (entity === 'slides') {
                const slides = await (0, contentStore_1.getSlides)();
                if (!id) {
                    jsonResponse(context, 200, slides);
                    return;
                }
                const found = slides.find((slide) => slide.id === id);
                if (!found) {
                    jsonResponse(context, 404, { error: `Slide "${id}" not found` });
                    return;
                }
                jsonResponse(context, 200, found);
                return;
            }
            if (entity === 'rooms') {
                const rooms = await (0, contentStore_1.getRooms)();
                if (!id) {
                    jsonResponse(context, 200, rooms);
                    return;
                }
                const normalizedId = id.toUpperCase();
                const found = rooms.find((room) => room.roomId === normalizedId);
                if (!found) {
                    jsonResponse(context, 404, { error: `Room "${normalizedId}" not found` });
                    return;
                }
                jsonResponse(context, 200, found);
                return;
            }
        }
        if (req.method === 'POST') {
            if (entity === 'knowledge-base' && id === 'upload') {
                await handleKnowledgeBaseUpload(context, req);
                return;
            }
            if (entity === 'slides' && !id) {
                const validationError = validateSlideForCreate(req.body);
                if (validationError) {
                    jsonResponse(context, 400, { error: validationError });
                    return;
                }
                const slide = req.body;
                const result = await (0, contentStore_1.upsertSlide)(slide);
                jsonResponse(context, result.created ? 201 : 200, {
                    message: result.created ? 'Slide created' : 'Slide updated',
                    id: slide.id,
                });
                return;
            }
            if (entity === 'rooms' && !id) {
                const validationError = validateRoomForCreate(req.body);
                if (validationError) {
                    jsonResponse(context, 400, { error: validationError });
                    return;
                }
                const room = req.body;
                room.roomId = room.roomId.toUpperCase();
                const result = await (0, contentStore_1.upsertRoom)(room);
                jsonResponse(context, result.created ? 201 : 200, {
                    message: result.created ? 'Room created' : 'Room updated',
                    roomId: room.roomId,
                });
                return;
            }
            if (entity === 'rooms' && id && action === 'reorder') {
                const normalizedId = id.toUpperCase();
                const { slideSequence } = req.body || {};
                if (!Array.isArray(slideSequence)) {
                    jsonResponse(context, 400, { error: 'slideSequence array is required' });
                    return;
                }
                const updated = await (0, contentStore_1.patchRoom)(normalizedId, { slideSequence });
                if (!updated) {
                    jsonResponse(context, 404, { error: `Room "${normalizedId}" not found` });
                    return;
                }
                jsonResponse(context, 200, { message: 'Room slide sequence updated', room: updated });
                return;
            }
            if (entity === 'publish') {
                if (!(0, blobStorage_1.isBlobStorageConfigured)()) {
                    jsonResponse(context, 500, {
                        error: 'Content publish storage is not configured',
                        hint: (0, blobStorage_1.getBlobStorageConfigHint)(),
                    });
                    return;
                }
                const stagingSnapshot = await (0, blobStorage_1.readStagingContentStoreSnapshot)();
                let rawStagingStore;
                try {
                    rawStagingStore = JSON.parse(stagingSnapshot.buffer.toString('utf8'));
                }
                catch {
                    jsonResponse(context, 400, {
                        error: 'Staging content blob is not valid JSON.',
                    });
                    return;
                }
                const payload = normalizePublishPayload(rawStagingStore);
                const missingRefs = (0, contentStore_1.validateRoomSequences)(payload.rooms, payload.slides);
                if (missingRefs.length > 0) {
                    jsonResponse(context, 400, {
                        error: 'Cannot publish: room slide sequences contain missing slide IDs.',
                        missingReferences: missingRefs,
                    });
                    return;
                }
                const principal = (0, auth_1.getClientPrincipal)(req);
                const publishedBy = ((_d = principal === null || principal === void 0 ? void 0 : principal.userDetails) === null || _d === void 0 ? void 0 : _d.trim()) ||
                    ((_e = principal === null || principal === void 0 ? void 0 : principal.userId) === null || _e === void 0 ? void 0 : _e.trim()) ||
                    undefined;
                const publishedAt = new Date().toISOString();
                const publishResult = await (0, blobStorage_1.publishContentStoreSnapshotToProd)({
                    snapshot: stagingSnapshot,
                    publishedAt,
                    publishedVersion: payload.version,
                    publishedBy,
                });
                (_g = (_f = context.log) === null || _f === void 0 ? void 0 : _f.info) === null || _g === void 0 ? void 0 : _g.call(_f, '[admin] content publish completed', {
                    source: `${publishResult.sourceContainerName}/${publishResult.sourceBlobName}`,
                    target: `${publishResult.targetContainerName}/${publishResult.targetBlobName}`,
                    sourceEtag: publishResult.sourceEtag,
                    publishedVersion: publishResult.publishedVersion,
                    publishedAt: publishResult.publishedAt,
                    publishedBy: publishResult.publishedBy || null,
                });
                jsonResponse(context, 200, {
                    message: 'Staging content published to production successfully.',
                    publishInfo: {
                        publishedVersion: publishResult.publishedVersion,
                        publishedAt: publishResult.publishedAt,
                        publishedBy: publishResult.publishedBy || null,
                        sourceContainer: publishResult.sourceContainerName,
                        sourceBlob: publishResult.sourceBlobName,
                        targetContainer: publishResult.targetContainerName,
                        targetBlob: publishResult.targetBlobName,
                        sourceEtag: publishResult.sourceEtag,
                    },
                });
                return;
            }
            if (entity === 'indexer' && (id === 'refresh' || action === 'refresh')) {
                const result = await triggerIndexerRefresh();
                if (!result.ok) {
                    jsonResponse(context, 500, { error: result.details });
                    return;
                }
                jsonResponse(context, 202, { message: result.details });
                return;
            }
            if (entity === 'media' && id === 'upload-url') {
                await handleUploadUrl(context, req);
                return;
            }
            if (entity === 'media' && id === 'upload') {
                await handleUpload(context, req);
                return;
            }
        }
        if (req.method === 'PATCH') {
            if (entity === 'slides' && id) {
                const updated = await (0, contentStore_1.patchSlide)(id, req.body || {});
                if (!updated) {
                    jsonResponse(context, 404, { error: `Slide "${id}" not found` });
                    return;
                }
                jsonResponse(context, 200, { message: 'Slide updated', slide: updated });
                return;
            }
            if (entity === 'rooms' && id) {
                const normalizedId = id.toUpperCase();
                const updated = await (0, contentStore_1.patchRoom)(normalizedId, req.body || {});
                if (!updated) {
                    jsonResponse(context, 404, { error: `Room "${normalizedId}" not found` });
                    return;
                }
                jsonResponse(context, 200, { message: 'Room updated', room: updated });
                return;
            }
        }
        if (req.method === 'DELETE') {
            if (entity === 'knowledge-base' && id) {
                await handleKnowledgeBaseDelete(context, id);
                return;
            }
            if (entity === 'slides' && id) {
                const deleted = await (0, contentStore_1.deleteSlide)(id);
                if (!deleted) {
                    jsonResponse(context, 404, { error: `Slide "${id}" not found` });
                    return;
                }
                jsonResponse(context, 200, { message: 'Slide deleted', id });
                return;
            }
            if (entity === 'rooms' && id) {
                const normalizedId = id.toUpperCase();
                const deleted = await (0, contentStore_1.deleteRoom)(normalizedId);
                if (!deleted) {
                    jsonResponse(context, 404, { error: `Room "${normalizedId}" not found` });
                    return;
                }
                jsonResponse(context, 200, { message: 'Room deleted', roomId: normalizedId });
                return;
            }
        }
        jsonResponse(context, 404, {
            error: `Unsupported route for entity "${entity}" with method "${req.method}"`,
        });
    }
    catch (error) {
        if (error instanceof blobStorage_1.ContentStorePublishConflictError) {
            (_j = (_h = context.log) === null || _h === void 0 ? void 0 : _h.warn) === null || _j === void 0 ? void 0 : _j.call(_h, '[admin] publish conflict', { message: error.message });
            jsonResponse(context, 409, {
                error: error.message,
                retryable: true,
            });
            return;
        }
        if (typeof (error === null || error === void 0 ? void 0 : error.message) === 'string' &&
            error.message.startsWith('Invalid staging content store:')) {
            jsonResponse(context, 400, {
                error: error.message,
            });
            return;
        }
        context.log.error('[admin] request failed', error);
        jsonResponse(context, 500, {
            error: 'Admin API request failed',
            details: (error === null || error === void 0 ? void 0 : error.message) || 'Unknown error',
        });
    }
}
