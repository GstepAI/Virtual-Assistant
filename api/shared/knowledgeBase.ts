const KNOWLEDGE_BASE_TAGS = [
  'funds',
  'about',
  'general',
  'golden-visa',
] as const;

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

const EXTENSION_CONTENT_TYPE_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export type KnowledgeBaseTag = (typeof KNOWLEDGE_BASE_TAGS)[number];

function sanitizeFileName(fileName: string): string {
  const sanitized = fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '');

  return sanitized || `document-${Date.now()}`;
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase();
}

function getFileExtension(fileName: string): string {
  const normalized = fileName.trim().toLowerCase();
  const index = normalized.lastIndexOf('.');
  if (index <= 0 || index === normalized.length - 1) {
    return '';
  }
  return normalized.slice(index);
}

function normalizeContentType(contentType: string): string {
  return contentType.trim().toLowerCase();
}

export function isKnowledgeBaseTag(value: string): value is KnowledgeBaseTag {
  return (KNOWLEDGE_BASE_TAGS as readonly string[]).includes(normalizeTag(value));
}

export function normalizeKnowledgeBaseTag(value: string): KnowledgeBaseTag | null {
  const normalized = normalizeTag(value);
  return isKnowledgeBaseTag(normalized) ? normalized : null;
}

export function isAllowedKnowledgeBaseFile(
  fileName: string,
  contentType: string
): boolean {
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

export function resolveKnowledgeBaseContentType(
  fileName: string,
  providedContentType: string
): string {
  const normalizedProvided = normalizeContentType(providedContentType);
  if (
    normalizedProvided &&
    normalizedProvided !== 'application/octet-stream' &&
    ALLOWED_KNOWLEDGE_BASE_CONTENT_TYPES.has(normalizedProvided)
  ) {
    return normalizedProvided;
  }

  const extension = getFileExtension(fileName);
  return EXTENSION_CONTENT_TYPE_MAP[extension] || 'application/octet-stream';
}

export function buildKnowledgeBaseBlobPath(
  tag: KnowledgeBaseTag,
  fileName: string,
  timestamp = Date.now()
): string {
  const safeName = sanitizeFileName(fileName);
  const safeTimestamp = Number.isFinite(timestamp) ? Math.floor(timestamp) : Date.now();
  return `knowledge-base/${tag}/${safeTimestamp}_${safeName}`;
}

export function encodeKnowledgeBaseDocumentId(blobPath: string): string {
  return Buffer.from(blobPath, 'utf8').toString('base64url');
}

export function decodeKnowledgeBaseDocumentId(id: string): string | null {
  try {
    const decoded = Buffer.from(id, 'base64url').toString('utf8');
    const normalized = decoded.trim().replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalized || normalized.includes('..')) {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}
