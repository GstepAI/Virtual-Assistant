const DEFAULT_MEDIA_BLOB_CONTAINER = 'bluecrow-media';

function getDefaultMediaContainer(): string {
  const configured = import.meta.env.VITE_MEDIA_BLOB_CONTAINER?.trim();
  return configured || DEFAULT_MEDIA_BLOB_CONTAINER;
}

function encodePathSegment(segment: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(segment));
  } catch {
    return encodeURIComponent(segment);
  }
}

function normalizePathSegments(rawPath: string): string[] {
  const normalized = rawPath
    .replace(/\\/g, '/')
    .split(/[?#]/)[0]
    .trim();

  if (!normalized) {
    return [];
  }

  return normalized
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function buildMediaProxyUrl(container: string, blobSegments: string[]): string {
  const encodedContainer = encodeURIComponent(container.trim());
  const encodedPath = blobSegments.map(encodePathSegment).join('/');
  return `/api/media/${encodedContainer}/${encodedPath}`;
}

function extractBlobUrlParts(rawUrl: string): {
  container: string;
  blobSegments: string[];
} | null {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return null;
  }

  if (!/\.blob\.core\.windows\.net$/i.test(parsedUrl.hostname)) {
    return null;
  }

  const pathSegments = normalizePathSegments(parsedUrl.pathname);
  if (pathSegments.length < 2) {
    return null;
  }

  const [container, ...blobSegments] = pathSegments;
  if (!container || blobSegments.length === 0) {
    return null;
  }

  return { container, blobSegments };
}

export function resolveMediaAssetUrl(raw: string | undefined): string | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const value = raw.trim();
  if (!value) {
    return '';
  }

  if (value.startsWith('data:') || value.startsWith('/api/media/')) {
    return value;
  }

  if (/^(https?:)?\/\//i.test(value)) {
    const absoluteUrl = value.startsWith('//')
      ? `https:${value}`
      : value;
    const blobParts = extractBlobUrlParts(absoluteUrl);
    if (!blobParts) {
      return value;
    }
    return buildMediaProxyUrl(blobParts.container, blobParts.blobSegments);
  }

  const blobSegments = normalizePathSegments(value);
  if (blobSegments.length === 0) {
    return '';
  }

  return buildMediaProxyUrl(getDefaultMediaContainer(), blobSegments);
}
