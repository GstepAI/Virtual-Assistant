import type { Slide } from '../types';
import type { RoomConfiguration } from '../types/roomConfig';

export interface AdminContentResponse {
  summary: {
    schemaVersion: string;
    updatedAt: string;
    version: number;
    roomConfigVersion: string;
    roomConfigLastUpdated: string;
    slideCount: number;
    roomCount: number;
  };
  content: {
    version: number;
    updatedAt: string;
    slides: Slide[];
    rooms: RoomConfiguration[];
    roomConfigVersion: string;
    roomConfigLastUpdated: string;
  };
}

export interface UploadUrlResponse {
  uploadUrl: string;
  token: string;
  expiresAt: string;
  assetUrl: string;
  maxBytes?: number;
  method: 'POST';
  mode: string;
}

export interface PublishContentResponse {
  message: string;
  publishInfo: {
    publishedVersion: number;
    publishedAt: string;
    publishedBy?: string | null;
    sourceContainer?: string;
    sourceBlob?: string;
    targetContainer?: string;
    targetBlob?: string;
    sourceEtag?: string;
  };
}

export type KnowledgeBaseTag = 'funds' | 'about' | 'general' | 'golden-visa';

export interface KnowledgeBaseDocument {
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

async function parseApiError(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (payload?.error) {
      return payload.error;
    }
  } catch {
    // Ignore and fallback to generic message
  }
  return `Request failed with status ${response.status}`;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function getAuthMe(): Promise<any[]> {
  try {
    const response = await fetch('/.auth/me', {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return [];
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return [];
    }

    const payload = await response.json();

    // SWA can return either:
    // 1) legacy array payload
    // 2) { clientPrincipal: ... } object payload
    if (Array.isArray(payload)) {
      return payload;
    }

    if (payload && typeof payload === 'object' && 'clientPrincipal' in payload) {
      const principal = (payload as any).clientPrincipal;
      return principal ? [principal] : [];
    }

    return [];
  } catch {
    return [];
  }
}

export function getAadLoginUrl(postLoginRedirectUri?: string): string {
  const redirect =
    postLoginRedirectUri ||
    `${window.location.origin}${window.location.pathname}${window.location.search}`;
  return `/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(redirect)}`;
}

export async function getAdminContent(): Promise<AdminContentResponse> {
  const response = await fetch('/api/cms/content', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new ApiError(await parseApiError(response), response.status);
  }

  try {
    return await response.json();
  } catch {
    const contentType = response.headers.get('content-type') || '';
    const isLocalHost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1');
    const localHint = isLocalHost
      ? ' Local dev tip: run `swa start http://localhost:3000 --api-location api`.'
      : '';
    throw new Error(
      `Admin API returned non-JSON response (${contentType || 'unknown'}).${localHint}`
    );
  }
}

export async function patchSlide(
  slideId: string,
  patch: Partial<Slide>
): Promise<Slide> {
  const response = await fetch(`/api/cms/slides/${encodeURIComponent(slideId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const payload = await response.json();
  return payload.slide as Slide;
}

export async function upsertSlide(slide: Slide): Promise<{ message: string; id: string }> {
  const response = await fetch('/api/cms/slides', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(slide),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const payload = await response.json();
  return {
    message: payload.message as string,
    id: payload.id as string,
  };
}

export async function deleteSlide(slideId: string): Promise<void> {
  const response = await fetch(`/api/cms/slides/${encodeURIComponent(slideId)}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
}

export async function deleteRoom(roomId: string): Promise<void> {
  const response = await fetch(`/api/cms/rooms/${encodeURIComponent(roomId)}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
}

export async function upsertRoom(
  room: RoomConfiguration
): Promise<{ created: boolean; roomId: string }> {
  const response = await fetch('/api/cms/rooms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(room),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const payload = await response.json();
  return {
    created: response.status === 201,
    roomId: payload.roomId as string,
  };
}

export async function patchRoom(
  roomId: string,
  patch: Partial<RoomConfiguration>
): Promise<RoomConfiguration> {
  const response = await fetch(`/api/cms/rooms/${encodeURIComponent(roomId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const payload = await response.json();
  return payload.room as RoomConfiguration;
}

export async function reorderRoomSlides(
  roomId: string,
  slideSequence: string[]
): Promise<RoomConfiguration> {
  const response = await fetch(
    `/api/cms/rooms/${encodeURIComponent(roomId)}/reorder`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ slideSequence }),
    }
  );

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const payload = await response.json();
  return payload.room as RoomConfiguration;
}

export async function publishContent(): Promise<PublishContentResponse> {
  const response = await fetch('/api/cms/publish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const payload = await response.json();
  return {
    message: payload.message as string,
    publishInfo: payload.publishInfo as PublishContentResponse['publishInfo'],
  };
}

export async function requestUploadUrl(params: {
  fileName: string;
  contentType: string;
  mediaType: 'images' | 'videos';
  slideId?: string;
  category?: string;
  uploadContext?: 'general' | 'slide';
}): Promise<UploadUrlResponse> {
  const response = await fetch('/api/cms/media/upload-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return response.json();
}

function parseUploadErrorPayload(responseText: string, status: number): string {
  if (!responseText) {
    return `Request failed with status ${status}`;
  }
  try {
    const payload = JSON.parse(responseText);
    if (payload?.error) {
      return payload.error;
    }
  } catch {
    // Ignore parse failures and fallback to generic message.
  }
  return `Request failed with status ${status}`;
}

export async function uploadSignedMedia(params: {
  uploadUrl: string;
  token: string;
  base64Data: string;
  contentType: string;
  onProgress?: (progressPercent: number) => void;
}): Promise<{ assetUrl: string }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', params.uploadUrl, true);
    request.withCredentials = true;
    request.setRequestHeader('Content-Type', 'application/json');

    request.upload.onprogress = (event) => {
      if (!params.onProgress) {
        return;
      }
      if (!event.lengthComputable || event.total <= 0) {
        return;
      }
      const progress = Math.min(
        100,
        Math.round((event.loaded / event.total) * 100)
      );
      params.onProgress(progress);
    };

    request.onerror = () => {
      reject(new Error('Upload failed due to a network error.'));
    };

    request.onload = () => {
      const status = request.status;
      const responseText = request.responseText || '';

      if (status < 200 || status >= 300) {
        reject(new Error(parseUploadErrorPayload(responseText, status)));
        return;
      }

      let payload: any = null;
      if (responseText) {
        try {
          payload = JSON.parse(responseText);
        } catch {
          reject(new Error('Upload API returned an invalid response.'));
          return;
        }
      }

      const assetUrl = payload?.assetUrl;
      if (!assetUrl || typeof assetUrl !== 'string') {
        reject(new Error('Upload API response is missing assetUrl.'));
        return;
      }

      if (params.onProgress) {
        params.onProgress(100);
      }

      resolve({ assetUrl });
    };

    request.send(
      JSON.stringify({
        token: params.token,
        base64Data: params.base64Data,
        contentType: params.contentType,
      })
    );
  });
}

export async function getKnowledgeBaseDocuments(): Promise<KnowledgeBaseDocument[]> {
  const response = await fetch('/api/cms/knowledge-base', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const payload = await response.json();
  return Array.isArray(payload?.documents)
    ? (payload.documents as KnowledgeBaseDocument[])
    : [];
}

export async function uploadKnowledgeBaseDocument(params: {
  fileName: string;
  contentType: string;
  base64Data: string;
  description: string;
  tag: KnowledgeBaseTag;
  onProgress?: (progressPercent: number) => void;
}): Promise<KnowledgeBaseDocument> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', '/api/cms/knowledge-base/upload', true);
    request.withCredentials = true;
    request.setRequestHeader('Content-Type', 'application/json');

    request.upload.onprogress = (event) => {
      if (!params.onProgress) {
        return;
      }
      if (!event.lengthComputable || event.total <= 0) {
        return;
      }
      const progress = Math.min(
        100,
        Math.round((event.loaded / event.total) * 100)
      );
      params.onProgress(progress);
    };

    request.onerror = () => {
      reject(new Error('Upload failed due to a network error.'));
    };

    request.onload = () => {
      const status = request.status;
      const responseText = request.responseText || '';
      if (status < 200 || status >= 300) {
        reject(new Error(parseUploadErrorPayload(responseText, status)));
        return;
      }

      let payload: any = null;
      if (responseText) {
        try {
          payload = JSON.parse(responseText);
        } catch {
          reject(new Error('Upload API returned an invalid response.'));
          return;
        }
      }

      const document = payload?.document;
      if (!document || typeof document.id !== 'string') {
        reject(new Error('Upload API response is missing document metadata.'));
        return;
      }

      if (params.onProgress) {
        params.onProgress(100);
      }

      resolve(document as KnowledgeBaseDocument);
    };

    request.send(
      JSON.stringify({
        fileName: params.fileName,
        contentType: params.contentType,
        base64Data: params.base64Data,
        description: params.description,
        tag: params.tag,
      })
    );
  });
}

export async function deleteKnowledgeBaseDocument(id: string): Promise<void> {
  const response = await fetch(
    `/api/cms/knowledge-base/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      credentials: 'include',
    }
  );

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
}

export async function triggerIndexerRefresh(): Promise<string> {
  const response = await fetch('/api/cms/indexer/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const payload = await response.json();
  return payload.message as string;
}
