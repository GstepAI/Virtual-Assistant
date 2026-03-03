export type UploadMediaType = 'images' | 'videos';

interface BuildSlideMediaPathParams {
  category: string;
  mediaType: UploadMediaType;
  slideId: string;
  fileName: string;
  timestamp?: number;
}

interface BuildGeneralMediaPathParams {
  mediaType: UploadMediaType;
  fileName: string;
  timestamp?: number;
  randomSuffix?: string;
}

export function sanitizeFileName(fileName: string): string {
  const sanitized = fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '');

  return sanitized || `asset-${Date.now()}`;
}

export function sanitizePathSegment(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '');

  return sanitized || fallback;
}

export function buildSlideMediaPath(params: BuildSlideMediaPathParams): string {
  const timestamp =
    Number.isFinite(params.timestamp) && Number(params.timestamp) > 0
      ? Math.floor(Number(params.timestamp))
      : Date.now();

  const category = sanitizePathSegment(params.category, 'Uncategorized');
  const slideId = sanitizePathSegment(params.slideId, 'slide');
  const safeName = sanitizeFileName(params.fileName);
  return `${category}/${params.mediaType}/${slideId}_${timestamp}_${safeName}`;
}

export function buildGeneralMediaPath(
  params: BuildGeneralMediaPathParams
): string {
  const timestamp =
    Number.isFinite(params.timestamp) && Number(params.timestamp) > 0
      ? Math.floor(Number(params.timestamp))
      : Date.now();

  const safeName = sanitizeFileName(params.fileName);
  const date = new Date(timestamp);
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const suffix = sanitizePathSegment(
    params.randomSuffix || 'upload',
    'upload'
  ).toLowerCase();
  return `uploads/${params.mediaType}/${year}/${month}/${timestamp}-${suffix}-${safeName}`;
}
