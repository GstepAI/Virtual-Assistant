"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentStorePublishConflictError = void 0;
exports.isBlobStorageConfigured = isBlobStorageConfigured;
exports.getBlobStorageConfigHint = getBlobStorageConfigHint;
exports.getContentStoreContainerName = getContentStoreContainerName;
exports.getContentStoreBlobName = getContentStoreBlobName;
exports.getContentStoreProdContainerName = getContentStoreProdContainerName;
exports.getContentStoreProdBlobName = getContentStoreProdBlobName;
exports.getMediaContainerName = getMediaContainerName;
exports.getKnowledgeBaseContainerName = getKnowledgeBaseContainerName;
exports.readContentStoreBlob = readContentStoreBlob;
exports.writeContentStoreBlob = writeContentStoreBlob;
exports.readStagingContentStoreSnapshot = readStagingContentStoreSnapshot;
exports.publishContentStoreSnapshotToProd = publishContentStoreSnapshotToProd;
exports.uploadMediaBlob = uploadMediaBlob;
exports.uploadKnowledgeBaseBlob = uploadKnowledgeBaseBlob;
exports.listKnowledgeBaseBlobs = listKnowledgeBaseBlobs;
exports.deleteKnowledgeBaseBlob = deleteKnowledgeBaseBlob;
exports.downloadKnowledgeBaseBlob = downloadKnowledgeBaseBlob;
const storage_blob_1 = require("@azure/storage-blob");
let cachedBlobServiceClient;
function getStorageConnectionString() {
    const candidates = [
        process.env.BLOB_STORAGE_CONNECTION_STRING,
        process.env.AZURE_STORAGE_CONNECTION_STRING,
        process.env.AzureWebJobsStorage,
    ];
    for (const candidate of candidates) {
        const value = candidate === null || candidate === void 0 ? void 0 : candidate.trim();
        if (value) {
            return value;
        }
    }
    return null;
}
function getBlobServiceClient() {
    if (cachedBlobServiceClient !== undefined) {
        return cachedBlobServiceClient;
    }
    const connectionString = getStorageConnectionString();
    if (!connectionString) {
        cachedBlobServiceClient = null;
        return cachedBlobServiceClient;
    }
    cachedBlobServiceClient = storage_blob_1.BlobServiceClient.fromConnectionString(connectionString);
    return cachedBlobServiceClient;
}
function isNotFoundError(error) {
    var _a;
    return (Number(error === null || error === void 0 ? void 0 : error.statusCode) === 404 ||
        (error === null || error === void 0 ? void 0 : error.code) === 'BlobNotFound' ||
        ((_a = error === null || error === void 0 ? void 0 : error.details) === null || _a === void 0 ? void 0 : _a.errorCode) === 'BlobNotFound');
}
function isConditionNotMetError(error) {
    var _a;
    return (Number(error === null || error === void 0 ? void 0 : error.statusCode) === 412 ||
        (error === null || error === void 0 ? void 0 : error.code) === 'ConditionNotMet' ||
        ((_a = error === null || error === void 0 ? void 0 : error.details) === null || _a === void 0 ? void 0 : _a.errorCode) === 'ConditionNotMet');
}
function normalizeBlobName(value) {
    const normalized = value.trim().replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalized || normalized.includes('..')) {
        return null;
    }
    return normalized;
}
async function getContainerClient(containerName, publicAccess) {
    var _a;
    const serviceClient = getBlobServiceClient();
    if (!serviceClient) {
        throw new Error(`Blob storage is not configured. ${getBlobStorageConfigHint()}`);
    }
    const containerClient = serviceClient.getContainerClient(containerName);
    try {
        if (publicAccess) {
            await containerClient.createIfNotExists({ access: publicAccess });
        }
        else {
            await containerClient.createIfNotExists();
        }
    }
    catch (error) {
        // Ignore "container already exists" errors (common on storage accounts
        // with public access disabled where createIfNotExists triggers an ACL check).
        const code = (error === null || error === void 0 ? void 0 : error.code) || ((_a = error === null || error === void 0 ? void 0 : error.details) === null || _a === void 0 ? void 0 : _a.errorCode);
        if (code !== 'ContainerAlreadyExists' && (error === null || error === void 0 ? void 0 : error.statusCode) !== 409) {
            throw error;
        }
    }
    return containerClient;
}
function isBlobStorageConfigured() {
    return Boolean(getBlobServiceClient());
}
function getBlobStorageConfigHint() {
    return 'Set BLOB_STORAGE_CONNECTION_STRING (or AZURE_STORAGE_CONNECTION_STRING) in Static Web App application settings.';
}
function getContentStoreContainerName() {
    return (process.env.CONTENT_STORE_BLOB_CONTAINER ||
        process.env.CONTENT_BLOB_CONTAINER ||
        'bluecrow-content');
}
function getContentStoreBlobName() {
    return process.env.CONTENT_STORE_BLOB_NAME || 'content-store.json';
}
function getContentStoreProdContainerName() {
    return process.env.CONTENT_STORE_PROD_BLOB_CONTAINER || 'bluecrow-content-prod';
}
function getContentStoreProdBlobName() {
    return process.env.CONTENT_STORE_PROD_BLOB_NAME || getContentStoreBlobName();
}
function getMediaContainerName() {
    return process.env.MEDIA_BLOB_CONTAINER || 'bluecrow-media';
}
function getKnowledgeBaseContainerName() {
    return process.env.KNOWLEDGE_BASE_BLOB_CONTAINER || 'bluecrow-knowledge-base';
}
function getMediaPublicBaseUrl() {
    var _a;
    const baseUrl = (_a = process.env.MEDIA_PUBLIC_BASE_URL) === null || _a === void 0 ? void 0 : _a.trim();
    if (!baseUrl) {
        return null;
    }
    return baseUrl.replace(/\/+$/, '');
}
function shouldUsePublicMediaContainer() {
    return process.env.MEDIA_BLOB_PUBLIC_ACCESS === 'true';
}
async function readContentStoreBlob() {
    const serviceClient = getBlobServiceClient();
    if (!serviceClient) {
        return null;
    }
    const containerClient = await getContainerClient(getContentStoreContainerName());
    const blobClient = containerClient.getBlockBlobClient(getContentStoreBlobName());
    try {
        const rawBuffer = await blobClient.downloadToBuffer();
        return JSON.parse(rawBuffer.toString('utf8'));
    }
    catch (error) {
        if (isNotFoundError(error)) {
            return null;
        }
        throw error;
    }
}
async function writeContentStoreBlob(value) {
    const containerClient = await getContainerClient(getContentStoreContainerName());
    const blobClient = containerClient.getBlockBlobClient(getContentStoreBlobName());
    const serialized = `${JSON.stringify(value, null, 2)}\n`;
    await blobClient.upload(serialized, Buffer.byteLength(serialized), {
        blobHTTPHeaders: {
            blobContentType: 'application/json; charset=utf-8',
        },
    });
}
class ContentStorePublishConflictError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ContentStorePublishConflictError';
    }
}
exports.ContentStorePublishConflictError = ContentStorePublishConflictError;
function normalizeMetadataValue(value) {
    return value.replace(/[\r\n\t]/g, ' ').trim();
}
function toBuffer(raw) {
    if (Buffer.isBuffer(raw)) {
        return raw;
    }
    return Buffer.from(raw, 'utf8');
}
async function readStagingContentStoreSnapshot() {
    const sourceContainerName = getContentStoreContainerName();
    const sourceBlobName = getContentStoreBlobName();
    const containerClient = await getContainerClient(sourceContainerName);
    const blobClient = containerClient.getBlockBlobClient(sourceBlobName);
    let sourceEtag;
    try {
        const properties = await blobClient.getProperties();
        sourceEtag = properties.etag;
    }
    catch (error) {
        if (isNotFoundError(error)) {
            throw new Error(`Staging content blob "${sourceBlobName}" was not found in container "${sourceContainerName}".`);
        }
        throw error;
    }
    if (!sourceEtag) {
        throw new Error('Staging content blob does not expose an ETag.');
    }
    try {
        const buffer = await blobClient.downloadToBuffer(0, undefined, {
            conditions: {
                ifMatch: sourceEtag,
            },
        });
        return {
            sourceContainerName,
            sourceBlobName,
            sourceEtag,
            buffer,
        };
    }
    catch (error) {
        if (isConditionNotMetError(error)) {
            throw new ContentStorePublishConflictError('Staging content changed while preparing publish. Please retry.');
        }
        if (isNotFoundError(error)) {
            throw new Error(`Staging content blob "${sourceBlobName}" was not found in container "${sourceContainerName}".`);
        }
        throw error;
    }
}
async function publishContentStoreSnapshotToProd(params) {
    const { snapshot, publishedAt, publishedVersion, publishedBy } = params;
    const sourceContainerClient = await getContainerClient(snapshot.sourceContainerName);
    const sourceBlobClient = sourceContainerClient.getBlockBlobClient(snapshot.sourceBlobName);
    try {
        await sourceBlobClient.getProperties({
            conditions: {
                ifMatch: snapshot.sourceEtag,
            },
        });
    }
    catch (error) {
        if (isConditionNotMetError(error)) {
            throw new ContentStorePublishConflictError('Staging content changed during publish. Please retry.');
        }
        throw error;
    }
    const targetContainerName = getContentStoreProdContainerName();
    const targetBlobName = getContentStoreProdBlobName();
    const targetContainerClient = await getContainerClient(targetContainerName);
    const targetBlobClient = targetContainerClient.getBlockBlobClient(targetBlobName);
    let existingMetadata = {};
    try {
        const existingProperties = await targetBlobClient.getProperties();
        existingMetadata = existingProperties.metadata || {};
    }
    catch (error) {
        if (!isNotFoundError(error)) {
            throw error;
        }
    }
    const nextMetadata = {
        ...existingMetadata,
        publishedat: normalizeMetadataValue(publishedAt),
        publishedversion: String(publishedVersion),
    };
    if (publishedBy) {
        nextMetadata.publishedby = normalizeMetadataValue(publishedBy);
    }
    else {
        delete nextMetadata.publishedby;
    }
    const payload = toBuffer(snapshot.buffer);
    await targetBlobClient.upload(payload, payload.byteLength, {
        blobHTTPHeaders: {
            blobContentType: 'application/json; charset=utf-8',
        },
        metadata: nextMetadata,
    });
    return {
        sourceContainerName: snapshot.sourceContainerName,
        sourceBlobName: snapshot.sourceBlobName,
        sourceEtag: snapshot.sourceEtag,
        targetContainerName,
        targetBlobName,
        publishedAt,
        publishedVersion,
        publishedBy,
    };
}
async function uploadMediaBlob(relativePath, binary, contentType) {
    const blobPath = normalizeBlobName(relativePath);
    if (!blobPath) {
        throw new Error('Invalid upload path');
    }
    const publicAccess = shouldUsePublicMediaContainer() ? 'blob' : undefined;
    const containerClient = await getContainerClient(getMediaContainerName(), publicAccess);
    const blobClient = containerClient.getBlockBlobClient(blobPath);
    await blobClient.uploadData(binary, {
        blobHTTPHeaders: {
            blobContentType: contentType,
        },
    });
    const mediaBaseUrl = getMediaPublicBaseUrl();
    const assetUrl = mediaBaseUrl ? `${mediaBaseUrl}/${blobPath}` : blobClient.url;
    return {
        assetUrl,
        blobUrl: blobClient.url,
        blobPath,
    };
}
async function uploadKnowledgeBaseBlob(relativePath, binary, contentType, metadata) {
    const blobPath = normalizeBlobName(relativePath);
    if (!blobPath) {
        throw new Error('Invalid upload path');
    }
    const containerClient = await getContainerClient(getKnowledgeBaseContainerName());
    const blobClient = containerClient.getBlockBlobClient(blobPath);
    const normalizedMetadata = {};
    for (const [rawKey, rawValue] of Object.entries(metadata || {})) {
        const key = rawKey.trim().toLowerCase();
        const value = String(rawValue || '').trim();
        if (!key || !value) {
            continue;
        }
        normalizedMetadata[key] = value;
    }
    await blobClient.uploadData(binary, {
        blobHTTPHeaders: {
            blobContentType: contentType,
        },
        metadata: normalizedMetadata,
    });
    return {
        blobUrl: blobClient.url,
        blobPath,
    };
}
async function listKnowledgeBaseBlobs() {
    var _a;
    const containerClient = await getContainerClient(getKnowledgeBaseContainerName());
    const entries = [];
    for await (const blob of containerClient.listBlobsFlat({
        includeMetadata: true,
        prefix: 'knowledge-base/',
    })) {
        const blobPath = blob.name;
        const fileName = blobPath.split('/').pop() || blobPath;
        const blobClient = containerClient.getBlockBlobClient(blobPath);
        entries.push({
            blobPath,
            blobUrl: blobClient.url,
            fileName,
            sizeBytes: blob.properties.contentLength || 0,
            contentType: blob.properties.contentType || 'application/octet-stream',
            lastModified: ((_a = blob.properties.lastModified) === null || _a === void 0 ? void 0 : _a.toISOString()) ||
                new Date(0).toISOString(),
            metadata: blob.metadata || {},
        });
    }
    return entries;
}
async function deleteKnowledgeBaseBlob(relativePath) {
    const blobPath = normalizeBlobName(relativePath);
    if (!blobPath) {
        throw new Error('Invalid delete path');
    }
    const containerClient = await getContainerClient(getKnowledgeBaseContainerName());
    const blobClient = containerClient.getBlockBlobClient(blobPath);
    const result = await blobClient.deleteIfExists({ deleteSnapshots: 'include' });
    return Boolean(result.succeeded);
}
async function downloadKnowledgeBaseBlob(relativePath) {
    const blobPath = normalizeBlobName(relativePath);
    if (!blobPath) {
        throw new Error('Invalid download path');
    }
    const containerClient = await getContainerClient(getKnowledgeBaseContainerName());
    const blobClient = containerClient.getBlobClient(blobPath);
    const downloadResponse = await blobClient.download();
    const stream = downloadResponse.readableStreamBody;
    if (!stream) {
        throw new Error('Blob not found');
    }
    const chunks = [];
    await new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        stream.on('end', resolve);
        stream.on('error', reject);
    });
    return {
        binary: Buffer.concat(chunks),
        contentType: downloadResponse.contentType || 'application/octet-stream',
        fileName: blobPath.split('/').pop() || 'document',
    };
}
