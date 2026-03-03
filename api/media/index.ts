import { BlobServiceClient } from '@azure/storage-blob';

const ALLOWED_CONTAINERS = new Set([
  process.env.MEDIA_BLOB_CONTAINER || 'bluecrow-media',
]);

function getStorageConnectionString(): string | null {
  const candidates = [
    process.env.BLOB_STORAGE_CONNECTION_STRING,
    process.env.AZURE_STORAGE_CONNECTION_STRING,
    process.env.AzureWebJobsStorage,
  ];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) return value;
  }
  return null;
}

function getMimeType(blobPath: string): string {
  const ext = blobPath.split('.').pop()?.toLowerCase() || '';
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

export default async function (context: any, req: any) {
  const container: string = req.params?.container || '';
  const blobPath: string = req.params?.blobPath || '';

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
    const serviceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = serviceClient.getContainerClient(container);
    const blobClient = containerClient.getBlobClient(blobPath);

    const downloadResponse = await blobClient.download();

    const contentType =
      downloadResponse.contentType ||
      getMimeType(blobPath);

    const chunks: Buffer[] = [];
    const stream = downloadResponse.readableStreamBody;

    if (!stream) {
      context.res = { status: 404, body: { error: 'Blob not found' } };
      return;
    }

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
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
  } catch (error: any) {
    const status =
      error?.statusCode === 404 || error?.code === 'BlobNotFound' ? 404 : 500;
    context.res = {
      status,
      body: { error: status === 404 ? 'Not found' : 'Failed to fetch media' },
    };
  }
}
