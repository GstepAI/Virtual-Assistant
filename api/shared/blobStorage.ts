import { BlobServiceClient } from '@azure/storage-blob';

type PublicAccessMode = 'blob' | 'container';

let cachedBlobServiceClient: BlobServiceClient | null | undefined;

function getStorageConnectionString(): string | null {
  const candidates = [
    process.env.BLOB_STORAGE_CONNECTION_STRING,
    process.env.AZURE_STORAGE_CONNECTION_STRING,
    process.env.AzureWebJobsStorage,
  ];

  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function getBlobServiceClient(): BlobServiceClient | null {
  if (cachedBlobServiceClient !== undefined) {
    return cachedBlobServiceClient;
  }

  const connectionString = getStorageConnectionString();
  if (!connectionString) {
    cachedBlobServiceClient = null;
    return cachedBlobServiceClient;
  }

  cachedBlobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  return cachedBlobServiceClient;
}

function isNotFoundError(error: any): boolean {
  return (
    Number(error?.statusCode) === 404 ||
    error?.code === 'BlobNotFound' ||
    error?.details?.errorCode === 'BlobNotFound'
  );
}

function isConditionNotMetError(error: any): boolean {
  return (
    Number(error?.statusCode) === 412 ||
    error?.code === 'ConditionNotMet' ||
    error?.details?.errorCode === 'ConditionNotMet'
  );
}

function normalizeBlobName(value: string): string | null {
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('..')) {
    return null;
  }
  return normalized;
}

async function getContainerClient(
  containerName: string,
  publicAccess?: PublicAccessMode
) {
  const serviceClient = getBlobServiceClient();
  if (!serviceClient) {
    throw new Error(
      `Blob storage is not configured. ${getBlobStorageConfigHint()}`
    );
  }

  const containerClient = serviceClient.getContainerClient(containerName);

  try {
    if (publicAccess) {
      await containerClient.createIfNotExists({ access: publicAccess });
    } else {
      await containerClient.createIfNotExists();
    }
  } catch (error: any) {
    // Ignore "container already exists" errors (common on storage accounts
    // with public access disabled where createIfNotExists triggers an ACL check).
    const code = error?.code || error?.details?.errorCode;
    if (code !== 'ContainerAlreadyExists' && error?.statusCode !== 409) {
      throw error;
    }
  }

  return containerClient;
}

export function isBlobStorageConfigured(): boolean {
  return Boolean(getBlobServiceClient());
}

export function getBlobStorageConfigHint(): string {
  return 'Set BLOB_STORAGE_CONNECTION_STRING (or AZURE_STORAGE_CONNECTION_STRING) in Static Web App application settings.';
}

export function getContentStoreContainerName(): string {
  return (
    process.env.CONTENT_STORE_BLOB_CONTAINER ||
    process.env.CONTENT_BLOB_CONTAINER ||
    'bluecrow-content'
  );
}

export function getContentStoreBlobName(): string {
  return process.env.CONTENT_STORE_BLOB_NAME || 'content-store.json';
}

export function getContentStoreProdContainerName(): string {
  return process.env.CONTENT_STORE_PROD_BLOB_CONTAINER || 'bluecrow-content-prod';
}

export function getContentStoreProdBlobName(): string {
  return process.env.CONTENT_STORE_PROD_BLOB_NAME || getContentStoreBlobName();
}

export function getMediaContainerName(): string {
  return process.env.MEDIA_BLOB_CONTAINER || 'bluecrow-media';
}

export function getKnowledgeBaseContainerName(): string {
  return process.env.KNOWLEDGE_BASE_BLOB_CONTAINER || 'bluecrow-knowledge-base';
}

function getMediaPublicBaseUrl(): string | null {
  const baseUrl = process.env.MEDIA_PUBLIC_BASE_URL?.trim();
  if (!baseUrl) {
    return null;
  }

  return baseUrl.replace(/\/+$/, '');
}

function shouldUsePublicMediaContainer(): boolean {
  return process.env.MEDIA_BLOB_PUBLIC_ACCESS === 'true';
}

export async function readContentStoreBlob<T>(): Promise<T | null> {
  const serviceClient = getBlobServiceClient();
  if (!serviceClient) {
    return null;
  }

  const containerClient = await getContainerClient(getContentStoreContainerName());
  const blobClient = containerClient.getBlockBlobClient(getContentStoreBlobName());

  try {
    const rawBuffer = await blobClient.downloadToBuffer();
    return JSON.parse(rawBuffer.toString('utf8')) as T;
  } catch (error: any) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function writeContentStoreBlob(value: unknown): Promise<void> {
  const containerClient = await getContainerClient(getContentStoreContainerName());
  const blobClient = containerClient.getBlockBlobClient(getContentStoreBlobName());
  const serialized = `${JSON.stringify(value, null, 2)}\n`;

  await blobClient.upload(serialized, Buffer.byteLength(serialized), {
    blobHTTPHeaders: {
      blobContentType: 'application/json; charset=utf-8',
    },
  });
}

export interface ContentStoreBlobSnapshot {
  sourceContainerName: string;
  sourceBlobName: string;
  sourceEtag: string;
  buffer: Buffer;
}

export class ContentStorePublishConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentStorePublishConflictError';
  }
}

function normalizeMetadataValue(value: string): string {
  return value.replace(/[\r\n\t]/g, ' ').trim();
}

function toBuffer(raw: string | Buffer): Buffer {
  if (Buffer.isBuffer(raw)) {
    return raw;
  }
  return Buffer.from(raw, 'utf8');
}

export async function readStagingContentStoreSnapshot(): Promise<ContentStoreBlobSnapshot> {
  const sourceContainerName = getContentStoreContainerName();
  const sourceBlobName = getContentStoreBlobName();
  const containerClient = await getContainerClient(sourceContainerName);
  const blobClient = containerClient.getBlockBlobClient(sourceBlobName);

  let sourceEtag: string | undefined;
  try {
    const properties = await blobClient.getProperties();
    sourceEtag = properties.etag;
  } catch (error: any) {
    if (isNotFoundError(error)) {
      throw new Error(
        `Staging content blob "${sourceBlobName}" was not found in container "${sourceContainerName}".`
      );
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
  } catch (error: any) {
    if (isConditionNotMetError(error)) {
      throw new ContentStorePublishConflictError(
        'Staging content changed while preparing publish. Please retry.'
      );
    }
    if (isNotFoundError(error)) {
      throw new Error(
        `Staging content blob "${sourceBlobName}" was not found in container "${sourceContainerName}".`
      );
    }
    throw error;
  }
}

export interface PublishContentStoreSnapshotParams {
  snapshot: ContentStoreBlobSnapshot;
  publishedAt: string;
  publishedVersion: number;
  publishedBy?: string;
}

export interface PublishContentStoreSnapshotResult {
  sourceContainerName: string;
  sourceBlobName: string;
  sourceEtag: string;
  targetContainerName: string;
  targetBlobName: string;
  publishedAt: string;
  publishedVersion: number;
  publishedBy?: string;
}

export async function publishContentStoreSnapshotToProd(
  params: PublishContentStoreSnapshotParams
): Promise<PublishContentStoreSnapshotResult> {
  const { snapshot, publishedAt, publishedVersion, publishedBy } = params;

  const sourceContainerClient = await getContainerClient(snapshot.sourceContainerName);
  const sourceBlobClient = sourceContainerClient.getBlockBlobClient(
    snapshot.sourceBlobName
  );

  try {
    await sourceBlobClient.getProperties({
      conditions: {
        ifMatch: snapshot.sourceEtag,
      },
    });
  } catch (error: any) {
    if (isConditionNotMetError(error)) {
      throw new ContentStorePublishConflictError(
        'Staging content changed during publish. Please retry.'
      );
    }
    throw error;
  }

  const targetContainerName = getContentStoreProdContainerName();
  const targetBlobName = getContentStoreProdBlobName();
  const targetContainerClient = await getContainerClient(targetContainerName);
  const targetBlobClient = targetContainerClient.getBlockBlobClient(targetBlobName);

  let existingMetadata: Record<string, string> = {};
  try {
    const existingProperties = await targetBlobClient.getProperties();
    existingMetadata = existingProperties.metadata || {};
  } catch (error: any) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }

  const nextMetadata: Record<string, string> = {
    ...existingMetadata,
    publishedat: normalizeMetadataValue(publishedAt),
    publishedversion: String(publishedVersion),
  };
  if (publishedBy) {
    nextMetadata.publishedby = normalizeMetadataValue(publishedBy);
  } else {
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

export async function uploadMediaBlob(
  relativePath: string,
  binary: Buffer,
  contentType: string
): Promise<{ assetUrl: string; blobUrl: string; blobPath: string }> {
  const blobPath = normalizeBlobName(relativePath);
  if (!blobPath) {
    throw new Error('Invalid upload path');
  }

  const publicAccess = shouldUsePublicMediaContainer() ? 'blob' : undefined;
  const containerClient = await getContainerClient(
    getMediaContainerName(),
    publicAccess
  );
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

export async function uploadKnowledgeBaseBlob(
  relativePath: string,
  binary: Buffer,
  contentType: string,
  metadata: Record<string, string>
): Promise<{ blobUrl: string; blobPath: string }> {
  const blobPath = normalizeBlobName(relativePath);
  if (!blobPath) {
    throw new Error('Invalid upload path');
  }

  const containerClient = await getContainerClient(getKnowledgeBaseContainerName());
  const blobClient = containerClient.getBlockBlobClient(blobPath);

  const normalizedMetadata: Record<string, string> = {};
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

export interface KnowledgeBaseBlobEntry {
  blobPath: string;
  blobUrl: string;
  fileName: string;
  sizeBytes: number;
  contentType: string;
  lastModified: string;
  metadata: Record<string, string>;
}

export async function listKnowledgeBaseBlobs(): Promise<KnowledgeBaseBlobEntry[]> {
  const containerClient = await getContainerClient(getKnowledgeBaseContainerName());
  const entries: KnowledgeBaseBlobEntry[] = [];

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
      lastModified:
        blob.properties.lastModified?.toISOString() ||
        new Date(0).toISOString(),
      metadata: blob.metadata || {},
    });
  }

  return entries;
}

export async function deleteKnowledgeBaseBlob(relativePath: string): Promise<boolean> {
  const blobPath = normalizeBlobName(relativePath);
  if (!blobPath) {
    throw new Error('Invalid delete path');
  }

  const containerClient = await getContainerClient(getKnowledgeBaseContainerName());
  const blobClient = containerClient.getBlockBlobClient(blobPath);
  const result = await blobClient.deleteIfExists({ deleteSnapshots: 'include' });
  return Boolean(result.succeeded);
}

/**
 * Extracts the blob path from a stored media asset URL.
 * Handles: relative paths, full Azure blob URLs, and custom CDN base URLs.
 * Returns null if the URL is empty or cannot be resolved to a media blob path.
 */
export function extractMediaBlobPath(assetUrl: string | undefined): string | null {
  if (!assetUrl?.trim()) {
    return null;
  }

  const value = assetUrl.trim();

  // Relative path already — e.g. "category/images/slideId_ts_file.jpg"
  if (!value.startsWith('http://') && !value.startsWith('https://') && !value.startsWith('//')) {
    return normalizeBlobName(value) || null;
  }

  const absoluteUrl = value.startsWith('//') ? `https:${value}` : value;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(absoluteUrl);
  } catch {
    return null;
  }

  // Azure blob URL: https://<account>.blob.core.windows.net/<container>/<blobPath>
  if (/\.blob\.core\.windows\.net$/i.test(parsedUrl.hostname)) {
    const segments = parsedUrl.pathname.replace(/^\//, '').split('/');
    // segments[0] is the container, rest is the blob path
    if (segments.length >= 2) {
      const blobPath = segments.slice(1).join('/').split('?')[0];
      return normalizeBlobName(blobPath) || null;
    }
    return null;
  }

  // Custom CDN / MEDIA_PUBLIC_BASE_URL: strip base and treat rest as blob path
  const mediaBaseUrl = getMediaPublicBaseUrl();
  if (mediaBaseUrl) {
    const base = mediaBaseUrl.replace(/\/+$/, '');
    if (absoluteUrl.startsWith(base + '/')) {
      const blobPath = absoluteUrl.slice(base.length + 1).split('?')[0];
      return normalizeBlobName(blobPath) || null;
    }
  }

  return null;
}

export async function deleteMediaBlob(relativePath: string): Promise<boolean> {
  const blobPath = normalizeBlobName(relativePath);
  if (!blobPath) {
    return false;
  }

  const containerClient = await getContainerClient(getMediaContainerName());
  const blobClient = containerClient.getBlockBlobClient(blobPath);
  const result = await blobClient.deleteIfExists({ deleteSnapshots: 'include' });
  return Boolean(result.succeeded);
}

export async function listMediaBlobsByPrefix(prefix: string): Promise<string[]> {
  const containerClient = await getContainerClient(getMediaContainerName());
  const paths: string[] = [];
  for await (const blob of containerClient.listBlobsFlat({ prefix })) {
    paths.push(blob.name);
  }
  return paths;
}

export async function downloadKnowledgeBaseBlob(
  relativePath: string
): Promise<{ binary: Buffer; contentType: string; fileName: string }> {
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

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk: Buffer | Uint8Array) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    );
    stream.on('end', resolve);
    stream.on('error', reject);
  });

  return {
    binary: Buffer.concat(chunks),
    contentType: downloadResponse.contentType || 'application/octet-stream',
    fileName: blobPath.split('/').pop() || 'document',
  };
}
