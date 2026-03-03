"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;
const storage_blob_1 = require("@azure/storage-blob");
const ALLOWED_CONTAINERS = new Set([
    process.env.MEDIA_BLOB_CONTAINER || 'bluecrow-media',
]);
function getStorageConnectionString() {
    const candidates = [
        process.env.BLOB_STORAGE_CONNECTION_STRING,
        process.env.AZURE_STORAGE_CONNECTION_STRING,
        process.env.AzureWebJobsStorage,
    ];
    for (const candidate of candidates) {
        const value = candidate === null || candidate === void 0 ? void 0 : candidate.trim();
        if (value)
            return value;
    }
    return null;
}
function getMimeType(blobPath) {
    var _a;
    const ext = ((_a = blobPath.split('.').pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
    switch (ext) {
        case 'png': return 'image/png';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'webp': return 'image/webp';
        case 'gif': return 'image/gif';
        case 'svg': return 'image/svg+xml';
        case 'mp4': return 'video/mp4';
        case 'webm': return 'video/webm';
        case 'mov': return 'video/quicktime';
        default: return 'application/octet-stream';
    }
}
async function default_1(context, req) {
    var _a, _b;
    const container = ((_a = req.params) === null || _a === void 0 ? void 0 : _a.container) || '';
    const blobPath = ((_b = req.params) === null || _b === void 0 ? void 0 : _b.blobPath) || '';
    if (!container || !blobPath) {
        context.res = { status: 400, body: { error: 'Missing container or path' } };
        return;
    }
    // Only allow access to the designated media container
    if (!ALLOWED_CONTAINERS.has(container)) {
        context.res = { status: 403, body: { error: 'Container not allowed' } };
        return;
    }
    // Prevent path traversal
    if (blobPath.includes('..') || blobPath.startsWith('/')) {
        context.res = { status: 400, body: { error: 'Invalid path' } };
        return;
    }
    const connectionString = getStorageConnectionString();
    if (!connectionString) {
        context.res = { status: 500, body: { error: 'Storage not configured' } };
        return;
    }
    try {
        const serviceClient = storage_blob_1.BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = serviceClient.getContainerClient(container);
        const blobClient = containerClient.getBlobClient(blobPath);
        const downloadResponse = await blobClient.download();
        const contentType = downloadResponse.contentType ||
            getMimeType(blobPath);
        const chunks = [];
        const stream = downloadResponse.readableStreamBody;
        if (!stream) {
            context.res = { status: 404, body: { error: 'Blob not found' } };
            return;
        }
        await new Promise((resolve, reject) => {
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.on('end', resolve);
            stream.on('error', reject);
        });
        const body = Buffer.concat(chunks);
        context.res = {
            status: 200,
            body,
            isRaw: true,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600',
                'Content-Length': String(body.length),
            },
        };
    }
    catch (error) {
        const status = (error === null || error === void 0 ? void 0 : error.statusCode) === 404 || (error === null || error === void 0 ? void 0 : error.code) === 'BlobNotFound' ? 404 : 500;
        context.res = {
            status,
            body: { error: status === 404 ? 'Not found' : 'Failed to fetch media' },
        };
    }
}
