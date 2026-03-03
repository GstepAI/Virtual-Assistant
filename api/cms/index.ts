import crypto from 'crypto';
import {
  deleteRoom,
  deleteSlide,
  getRooms,
  getSlides,
  getStoreSummary,
  loadStore,
  patchRoom,
  patchSlide,
  upsertRoom,
  upsertSlide,
  validateRoomSequences,
} from '../shared/contentStore';
import type { RoomConfiguration, Slide } from '../shared/contentTypes';
import { getClientPrincipal, requireAdmin } from '../shared/auth';
import { issueUploadToken, verifyUploadToken } from '../shared/uploadToken';
import {
  ContentStorePublishConflictError,
  deleteKnowledgeBaseBlob,
  deleteMediaBlob,
  downloadKnowledgeBaseBlob,
  extractMediaBlobPath,
  getBlobStorageConfigHint,
  isBlobStorageConfigured,
  listKnowledgeBaseBlobs,
  publishContentStoreSnapshotToProd,
  readStagingContentStoreSnapshot,
  uploadKnowledgeBaseBlob,
  uploadMediaBlob,
} from '../shared/blobStorage';
import {
  buildGeneralMediaPath,
  buildSlideMediaPath,
  type UploadMediaType,
} from '../shared/mediaUploadPath';
import {
  buildKnowledgeBaseBlobPath,
  decodeKnowledgeBaseDocumentId,
  encodeKnowledgeBaseDocumentId,
  isAllowedKnowledgeBaseFile,
  normalizeKnowledgeBaseTag,
  resolveKnowledgeBaseContentType,
  type KnowledgeBaseTag,
} from '../shared/knowledgeBase';

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

function jsonResponse(context: any, status: number, body: any): void {
  context.res = { status, body };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw || '', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

function normalizeContentType(contentType: string): string {
  return contentType.trim().toLowerCase();
}

function getMaxUploadMb(mediaType: UploadMediaType): number {
  const fallback = parsePositiveInt(process.env.MEDIA_UPLOAD_MAX_MB, 25);
  if (mediaType === 'images') {
    return parsePositiveInt(process.env.MEDIA_UPLOAD_MAX_IMAGE_MB, fallback);
  }
  return parsePositiveInt(process.env.MEDIA_UPLOAD_MAX_VIDEO_MB, fallback);
}

function getMaxUploadBytes(mediaType: UploadMediaType): number {
  return getMaxUploadMb(mediaType) * 1024 * 1024;
}

function getKnowledgeBaseMaxUploadBytes(): number {
  const maxMb = parsePositiveInt(
    process.env.KNOWLEDGE_BASE_UPLOAD_MAX_MB,
    KNOWLEDGE_BASE_UPLOAD_MAX_MB
  );
  return maxMb * 1024 * 1024;
}

function safeFileNameForHeader(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function validateSlideForCreate(slide: any): string | null {
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
  if (
    typeof script['en-US'] !== 'string' ||
    typeof script['en-UK'] !== 'string' ||
    typeof script['pt-BR'] !== 'string'
  ) {
    return 'pitchScript must include en-US, en-UK, and pt-BR strings';
  }
  return null;
}

function validateRoomForCreate(room: any): string | null {
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

function parseVersionNumber(raw: unknown): number | null {
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

function normalizePublishPayload(rawStore: any): {
  slides: Slide[];
  rooms: RoomConfiguration[];
  version: number;
} {
  if (!rawStore || typeof rawStore !== 'object') {
    throw new Error('Invalid staging content store: root payload must be an object.');
  }

  if (Array.isArray(rawStore.slides) && Array.isArray(rawStore.rooms)) {
    const version =
      parseVersionNumber(rawStore.version) ??
      parseVersionNumber(rawStore.publishedVersion) ??
      1;
    return {
      slides: rawStore.slides as Slide[],
      rooms: rawStore.rooms as RoomConfiguration[],
      version,
    };
  }

  const draftSnapshot = rawStore.draft;
  if (
    draftSnapshot &&
    typeof draftSnapshot === 'object' &&
    Array.isArray((draftSnapshot as any).slides) &&
    Array.isArray((draftSnapshot as any).rooms)
  ) {
    const version = parseVersionNumber(rawStore.publishedVersion) ?? 1;
    return {
      slides: (draftSnapshot as any).slides as Slide[],
      rooms: (draftSnapshot as any).rooms as RoomConfiguration[],
      version,
    };
  }

  throw new Error(
    'Invalid staging content store: expected slides/rooms arrays in live or legacy draft shape.'
  );
}

function isAllowedContentType(
  mediaType: UploadMediaType,
  contentType: string
): boolean {
  const normalized = normalizeContentType(contentType);
  if (mediaType === 'images') {
    return IMAGE_TYPES.has(normalized);
  }
  return VIDEO_TYPES.has(normalized);
}

async function triggerIndexerRefresh(): Promise<{ ok: boolean; details: string }> {
  const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT;
  const searchApiKey = process.env.AZURE_SEARCH_API_KEY;
  const indexerName = process.env.AZURE_SEARCH_INDEXER_NAME;

  if (!searchEndpoint || !searchApiKey || !indexerName) {
    return {
      ok: false,
      details:
        'AZURE_SEARCH_ENDPOINT, AZURE_SEARCH_API_KEY, and AZURE_SEARCH_INDEXER_NAME are required',
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

async function handleUploadUrl(context: any, req: any): Promise<void> {
  const {
    fileName,
    contentType: rawContentType,
    mediaType: rawMediaType = 'images',
    slideId,
    category,
    uploadContext = 'general',
  } = req.body || {};

  if (!isBlobStorageConfigured()) {
    jsonResponse(context, 500, {
      error: 'Media upload storage is not configured',
      hint: getBlobStorageConfigHint(),
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
  const mediaType =
    rawMediaType === 'images' || rawMediaType === 'videos' ? rawMediaType : null;
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
    filePath = buildSlideMediaPath({
      category,
      mediaType,
      slideId,
      fileName,
      timestamp,
    });
  } else {
    filePath = buildGeneralMediaPath({
      mediaType,
      fileName,
      timestamp,
      randomSuffix: crypto.randomUUID().slice(0, 8),
    });
  }

  const ttlSeconds = Number.parseInt(process.env.MEDIA_UPLOAD_TTL_SECONDS || '300', 10);
  const maxBytes = getMaxUploadBytes(mediaType);
  const tokenPayload = issueUploadToken(filePath, contentType, ttlSeconds, {
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

async function handleUpload(context: any, req: any): Promise<void> {
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

  const verification = verifyUploadToken(token);
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

  const mediaType: UploadMediaType =
    verification.payload.mediaType ||
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

  if (!isBlobStorageConfigured()) {
    jsonResponse(context, 500, {
      error: 'Media upload storage is not configured',
      hint: getBlobStorageConfigHint(),
    });
    return;
  }

  const uploadResult = await uploadMediaBlob(
    verification.payload.relativePath,
    binary,
    contentType
  );

  context.log?.info?.('[admin] media upload complete', {
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

interface KnowledgeBaseDocumentRecord {
  id: string;
  fileName: string;
  description: string;
  tag: KnowledgeBaseTag;
  uploadedAt: string;
  uploadedBy: string;
  sizeBytes: number;
  contentType: string;
  openUrl: string;
}

async function handleKnowledgeBaseList(context: any): Promise<void> {
  if (!isBlobStorageConfigured()) {
    jsonResponse(context, 500, {
      error: 'Knowledge base storage is not configured',
      hint: getBlobStorageConfigHint(),
    });
    return;
  }

  const blobs = await listKnowledgeBaseBlobs();
  const documents: KnowledgeBaseDocumentRecord[] = blobs.map((blob) => {
    const metadata = blob.metadata || {};
    const tag = normalizeKnowledgeBaseTag(metadata.tag || '') || 'general';
    const uploadedAt = metadata.uploadedat || blob.lastModified;
    const uploadedBy = metadata.uploadedby || '';
    const description = metadata.description || '';
    const id = encodeKnowledgeBaseDocumentId(blob.blobPath);
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
    const byDate =
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
    if (byDate !== 0) {
      return byDate;
    }
    return a.fileName.localeCompare(b.fileName);
  });

  jsonResponse(context, 200, { documents });
}

async function handleKnowledgeBaseUpload(context: any, req: any): Promise<void> {
  if (!isBlobStorageConfigured()) {
    jsonResponse(context, 500, {
      error: 'Knowledge base storage is not configured',
      hint: getBlobStorageConfigHint(),
    });
    return;
  }

  const {
    fileName,
    contentType: rawContentType,
    base64Data,
    description,
    tag,
  } = req.body || {};

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

  const normalizedTag = normalizeKnowledgeBaseTag(tag);
  if (!normalizedTag) {
    jsonResponse(context, 400, {
      error: 'tag must be one of: funds, about, general, golden-visa',
    });
    return;
  }

  if (!isAllowedKnowledgeBaseFile(fileName, rawContentType)) {
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

  const contentType = resolveKnowledgeBaseContentType(fileName, rawContentType);
  const timestamp = Date.now();
  const blobPath = buildKnowledgeBaseBlobPath(normalizedTag, fileName, timestamp);
  const principal = getClientPrincipal(req);
  const uploadedBy =
    principal?.userDetails || principal?.userId || 'admin';
  const uploadedAt = new Date(timestamp).toISOString();

  const uploadResult = await uploadKnowledgeBaseBlob(blobPath, binary, contentType, {
    description: description.trim(),
    tag: normalizedTag,
    uploadedby: uploadedBy,
    uploadedat: uploadedAt,
  });

  const id = encodeKnowledgeBaseDocumentId(uploadResult.blobPath);
  context.log?.info?.('[admin] knowledge-base upload complete', {
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
    } as KnowledgeBaseDocumentRecord,
  });
}

async function handleKnowledgeBaseOpen(
  context: any,
  id: string | undefined
): Promise<void> {
  if (!id) {
    jsonResponse(context, 400, { error: 'Document id is required' });
    return;
  }

  const blobPath = decodeKnowledgeBaseDocumentId(id);
  if (!blobPath) {
    jsonResponse(context, 400, { error: 'Invalid document id' });
    return;
  }

  try {
    const payload = await downloadKnowledgeBaseBlob(blobPath);
    context.res = {
      status: 200,
      body: payload.binary,
      isRaw: true,
      headers: {
        'Content-Type': payload.contentType,
        'Content-Length': String(payload.binary.length),
        'Content-Disposition': `inline; filename="${safeFileNameForHeader(
          payload.fileName
        )}"`,
        'Cache-Control': 'no-store',
      },
    };
  } catch (error: any) {
    const status =
      error?.statusCode === 404 || error?.code === 'BlobNotFound' ? 404 : 500;
    jsonResponse(context, status, {
      error: status === 404 ? 'Document not found' : 'Failed to open document',
    });
  }
}

async function handleKnowledgeBaseDelete(
  context: any,
  id: string | undefined
): Promise<void> {
  if (!id) {
    jsonResponse(context, 400, { error: 'Document id is required' });
    return;
  }

  const blobPath = decodeKnowledgeBaseDocumentId(id);
  if (!blobPath) {
    jsonResponse(context, 400, { error: 'Invalid document id' });
    return;
  }

  const deleted = await deleteKnowledgeBaseBlob(blobPath);
  if (!deleted) {
    jsonResponse(context, 404, { error: 'Document not found' });
    return;
  }

  context.log?.info?.('[admin] knowledge-base document deleted', {
    path: blobPath,
  });
  jsonResponse(context, 200, { message: 'Knowledge base document deleted', id });
}

export default async function (context: any, req: any) {
  const entity = (req.params?.entity || '').toLowerCase();
  const id = req.params?.id;
  const action = (req.params?.action || '').toLowerCase();

  if (entity === 'me' && req.method === 'GET') {
    const principal = getClientPrincipal(req);
    jsonResponse(context, 200, {
      principal,
      hasPrincipal: !!principal,
    });
    return;
  }

  if (!requireAdmin(context, req)) {
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
        const store = await loadStore();
        const summary = await getStoreSummary();
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
        const slides = await getSlides();
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
        const rooms = await getRooms();
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
        const slide = req.body as Slide;
        const result = await upsertSlide(slide);
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
        const room = req.body as RoomConfiguration;
        room.roomId = room.roomId.toUpperCase();
        const result = await upsertRoom(room);
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
        const updated = await patchRoom(normalizedId, { slideSequence });
        if (!updated) {
          jsonResponse(context, 404, { error: `Room "${normalizedId}" not found` });
          return;
        }
        jsonResponse(context, 200, { message: 'Room slide sequence updated', room: updated });
        return;
      }

      if (entity === 'publish') {
        if (!isBlobStorageConfigured()) {
          jsonResponse(context, 500, {
            error: 'Content publish storage is not configured',
            hint: getBlobStorageConfigHint(),
          });
          return;
        }

        const stagingSnapshot = await readStagingContentStoreSnapshot();

        let rawStagingStore: any;
        try {
          rawStagingStore = JSON.parse(stagingSnapshot.buffer.toString('utf8'));
        } catch {
          jsonResponse(context, 400, {
            error: 'Staging content blob is not valid JSON.',
          });
          return;
        }

        const payload = normalizePublishPayload(rawStagingStore);
        const missingRefs = validateRoomSequences(payload.rooms, payload.slides);
        if (missingRefs.length > 0) {
          jsonResponse(context, 400, {
            error:
              'Cannot publish: room slide sequences contain missing slide IDs.',
            missingReferences: missingRefs,
          });
          return;
        }

        const principal = getClientPrincipal(req);
        const publishedBy =
          principal?.userDetails?.trim() ||
          principal?.userId?.trim() ||
          undefined;
        const publishedAt = new Date().toISOString();

        const publishResult = await publishContentStoreSnapshotToProd({
          snapshot: stagingSnapshot,
          publishedAt,
          publishedVersion: payload.version,
          publishedBy,
        });

        context.log?.info?.('[admin] content publish completed', {
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
        const updated = await patchSlide(id, req.body || {});
        if (!updated) {
          jsonResponse(context, 404, { error: `Slide "${id}" not found` });
          return;
        }
        jsonResponse(context, 200, { message: 'Slide updated', slide: updated });
        return;
      }

      if (entity === 'rooms' && id) {
        const normalizedId = id.toUpperCase();
        const updated = await patchRoom(normalizedId, req.body || {});
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
        // Load slide first so we can clean up its media blobs
        const allSlides = await getSlides();
        const slideToDelete = allSlides.find((s) => s.id === id);
        if (!slideToDelete) {
          jsonResponse(context, 404, { error: `Slide "${id}" not found` });
          return;
        }

        const deleted = await deleteSlide(id);
        if (!deleted) {
          jsonResponse(context, 404, { error: `Slide "${id}" not found` });
          return;
        }

        // Best-effort: delete associated media blobs from storage
        if (isBlobStorageConfigured()) {
          const mediaBlobPaths = [
            extractMediaBlobPath(slideToDelete.imageUrl),
            extractMediaBlobPath(slideToDelete.videoUrl),
          ].filter((p): p is string => p !== null);

          await Promise.allSettled(mediaBlobPaths.map((blobPath) => deleteMediaBlob(blobPath)));
        }

        jsonResponse(context, 200, { message: 'Slide deleted', id });
        return;
      }

      if (entity === 'rooms' && id) {
        const normalizedId = id.toUpperCase();
        const deleted = await deleteRoom(normalizedId);
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
  } catch (error: any) {
    if (error instanceof ContentStorePublishConflictError) {
      context.log?.warn?.('[admin] publish conflict', { message: error.message });
      jsonResponse(context, 409, {
        error: error.message,
        retryable: true,
      });
      return;
    }

    if (
      typeof error?.message === 'string' &&
      error.message.startsWith('Invalid staging content store:')
    ) {
      jsonResponse(context, 400, {
        error: error.message,
      });
      return;
    }

    context.log.error('[admin] request failed', error);
    jsonResponse(context, 500, {
      error: 'Admin API request failed',
      details: error?.message || 'Unknown error',
    });
  }
}
