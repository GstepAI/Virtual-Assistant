import slidesData from '../config/slides.json';
import roomConfigData from '../config/roomConfigurations.json';
import type { Slide } from '../types';
import { resolveMediaAssetUrl } from '../utils/mediaUrl';
import type {
  RoomConfiguration,
  RoomConfigurationSet,
} from '../types/roomConfig';

interface SlidesPayload {
  ALL_SLIDES: Slide[];
  PITCH_SLIDES: Slide[];
}

export interface ContentBundle {
  slides: Slide[];
  roomConfigSet: RoomConfigurationSet;
  source: 'api' | 'local';
}

const LOCAL_SLIDES = (slidesData as SlidesPayload).ALL_SLIDES;
const LOCAL_ROOMS = roomConfigData as RoomConfigurationSet;

let cachedBundle: ContentBundle | null = null;

function rewriteSlideUrls(slides: Slide[]): Slide[] {
  return slides.map((slide) => ({
    ...slide,
    imageUrl: resolveMediaAssetUrl(slide.imageUrl) || slide.imageUrl,
    videoUrl: slide.videoUrl
      ? resolveMediaAssetUrl(slide.videoUrl) || slide.videoUrl
      : undefined,
  }));
}

function getLocalBundle(): ContentBundle {
  return {
    slides: rewriteSlideUrls(LOCAL_SLIDES),
    roomConfigSet: LOCAL_ROOMS,
    source: 'local',
  };
}

export function clearContentCache(): void {
  cachedBundle = null;
}

export async function loadContentBundle(forceRefresh = false): Promise<ContentBundle> {
  if (!forceRefresh && cachedBundle) {
    return cachedBundle;
  }

  try {
    const [slidesResponse, roomsResponse] = await Promise.all([
      fetch('/api/content/slides'),
      fetch('/api/content/rooms'),
    ]);

    if (!slidesResponse.ok || !roomsResponse.ok) {
      throw new Error('Content API unavailable');
    }

    const slidesPayload = (await slidesResponse.json()) as SlidesPayload;
    const roomsPayload = (await roomsResponse.json()) as RoomConfigurationSet;

    cachedBundle = {
      slides: rewriteSlideUrls(slidesPayload.ALL_SLIDES || []),
      roomConfigSet: roomsPayload,
      source: 'api',
    };
    return cachedBundle;
  } catch {
    cachedBundle = getLocalBundle();
    return cachedBundle;
  }
}

export async function getRoomConfiguration(
  roomId: string,
  forceRefresh = false
): Promise<RoomConfiguration | null> {
  const bundle = await loadContentBundle(forceRefresh);
  const normalized = roomId.trim().toUpperCase();
  return bundle.roomConfigSet.configurations.find(
    (configuration) => configuration.roomId === normalized
  ) || null;
}

export async function getAllRoomConfigurations(
  forceRefresh = false
): Promise<RoomConfiguration[]> {
  const bundle = await loadContentBundle(forceRefresh);
  return bundle.roomConfigSet.configurations;
}
