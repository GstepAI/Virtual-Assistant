import { promises as fs } from 'fs';
import path from 'path';
import type {
  ContentSnapshot,
  ContentStore,
  RoomConfiguration,
  RoomConfigurationSet,
  Slide,
  SlidesPayload,
} from './contentTypes';
import {
  getBlobStorageConfigHint,
  isBlobStorageConfigured,
  readContentStoreBlob,
  writeContentStoreBlob,
} from './blobStorage';

const API_ROOT = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(API_ROOT, '..');
const DATA_DIR = path.join(API_ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'content-store.json');
const IS_AZURE_RUNTIME = Boolean(
  process.env.WEBSITE_HOSTNAME || process.env.WEBSITE_INSTANCE_ID
);

type StoreBackend = 'blob' | 'file';
let cachedStoreBackend: StoreBackend | null = null;

const CURRENT_SCHEMA_VERSION = '2.0.0';

const CONFIG_ROOT_CANDIDATES = [
  process.env.CONTENT_CONFIG_DIR,
  API_ROOT,
  PROJECT_ROOT,
  process.cwd(),
].filter((candidate): candidate is string => Boolean(candidate));

async function resolveConfigFile(fileName: string): Promise<string> {
  const attempts: string[] = [];

  for (const root of CONFIG_ROOT_CANDIDATES) {
    const candidatePath = path.join(path.resolve(root), 'config', fileName);
    attempts.push(candidatePath);

    try {
      await fs.access(candidatePath);
      return candidatePath;
    } catch {
      // Continue trying fallback paths.
    }
  }

  throw new Error(
    `Unable to locate config file "${fileName}". Looked in: ${attempts.join(', ')}`
  );
}

interface RawSlidesFile {
  ALL_SLIDES: Slide[];
  PITCH_SLIDES?: Slide[];
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso(): string {
  return new Date().toISOString();
}

function todayIso(): string {
  return nowIso().slice(0, 10);
}

function bumpPatchVersion(version: string): string {
  const parts = version.split('.');
  if (parts.length !== 3) {
    return version;
  }

  const major = Number.parseInt(parts[0], 10);
  const minor = Number.parseInt(parts[1], 10);
  const patch = Number.parseInt(parts[2], 10);
  if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) {
    return version;
  }

  return `${major}.${minor}.${patch + 1}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : fallback;
}

function normalizeSnapshot(
  rawSnapshot: unknown,
  fallbackVersion: string,
  fallbackLastUpdated: string
): ContentSnapshot {
  const snapshot = isRecord(rawSnapshot) ? rawSnapshot : {};
  const slides = Array.isArray(snapshot.slides) ? deepClone(snapshot.slides as Slide[]) : [];
  const rooms = Array.isArray(snapshot.rooms)
    ? deepClone(snapshot.rooms as RoomConfiguration[])
    : [];

  return {
    slides,
    rooms,
    roomConfigVersion: normalizeString(
      snapshot.roomConfigVersion,
      fallbackVersion
    ),
    roomConfigLastUpdated: normalizeString(
      snapshot.roomConfigLastUpdated,
      fallbackLastUpdated
    ),
  };
}

function normalizePersistedStore(rawStore: unknown): {
  store: ContentStore | null;
  migrated: boolean;
} {
  if (!isRecord(rawStore)) {
    return { store: null, migrated: false };
  }

  const now = nowIso();
  const today = now.slice(0, 10);

  const hasLiveShape =
    Array.isArray(rawStore.slides) &&
    Array.isArray(rawStore.rooms) &&
    'roomConfigVersion' in rawStore &&
    'roomConfigLastUpdated' in rawStore;

  if (hasLiveShape) {
    const store: ContentStore = {
      schemaVersion: normalizeString(rawStore.schemaVersion, CURRENT_SCHEMA_VERSION),
      updatedAt: normalizeString(rawStore.updatedAt, now),
      version: normalizePositiveInteger(rawStore.version, 1),
      slides: deepClone(rawStore.slides as Slide[]),
      rooms: deepClone(rawStore.rooms as RoomConfiguration[]),
      roomConfigVersion: normalizeString(rawStore.roomConfigVersion, '1.0.0'),
      roomConfigLastUpdated: normalizeString(rawStore.roomConfigLastUpdated, today),
    };
    const migrated =
      !('version' in rawStore) ||
      !('schemaVersion' in rawStore) ||
      store.schemaVersion !== rawStore.schemaVersion;
    return { store, migrated };
  }

  const hasLegacyShape = isRecord(rawStore.draft) || isRecord(rawStore.published);
  if (!hasLegacyShape) {
    return { store: null, migrated: false };
  }

  const fallbackVersion = '1.0.0';
  const fallbackLastUpdated = normalizeString(
    rawStore.updatedAt,
    normalizeString(rawStore.publishedAt, today)
  ).slice(0, 10);

  // Prefer legacy draft data so pending edits are not lost during migration.
  const sourceSnapshot = isRecord(rawStore.draft) ? rawStore.draft : rawStore.published;
  const snapshot = normalizeSnapshot(
    sourceSnapshot,
    fallbackVersion,
    fallbackLastUpdated
  );

  const store: ContentStore = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: normalizeString(rawStore.updatedAt, now),
    version: normalizePositiveInteger(rawStore.publishedVersion, 1),
    slides: snapshot.slides,
    rooms: snapshot.rooms,
    roomConfigVersion: snapshot.roomConfigVersion,
    roomConfigLastUpdated: snapshot.roomConfigLastUpdated,
  };

  return { store, migrated: true };
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  const serialized = JSON.stringify(value, null, 2);
  await fs.writeFile(filePath, `${serialized}\n`, 'utf8');
}

function resolveStoreBackend(): StoreBackend {
  if (cachedStoreBackend) {
    return cachedStoreBackend;
  }

  const configuredBackend = (process.env.CONTENT_STORE_BACKEND || 'auto')
    .trim()
    .toLowerCase();

  if (configuredBackend === 'file') {
    cachedStoreBackend = 'file';
    return cachedStoreBackend;
  }

  if (configuredBackend === 'blob') {
    if (!isBlobStorageConfigured()) {
      throw new Error(
        `CONTENT_STORE_BACKEND is "blob" but blob storage is not configured. ${getBlobStorageConfigHint()}`
      );
    }
    cachedStoreBackend = 'blob';
    return cachedStoreBackend;
  }

  if (isBlobStorageConfigured()) {
    cachedStoreBackend = 'blob';
    return cachedStoreBackend;
  }

  if (IS_AZURE_RUNTIME) {
    throw new Error(
      `Content store persistence requires blob storage in Azure. ${getBlobStorageConfigHint()}`
    );
  }

  cachedStoreBackend = 'file';
  return cachedStoreBackend;
}

export function getStoreBackend(): StoreBackend {
  return resolveStoreBackend();
}

async function readPersistedStoreRaw(): Promise<unknown | null> {
  const backend = resolveStoreBackend();

  if (backend === 'blob') {
    return readContentStoreBlob<unknown>();
  }

  try {
    await fs.access(DATA_FILE);
  } catch {
    return null;
  }

  return readJsonFile<unknown>(DATA_FILE);
}

async function writePersistedStore(store: ContentStore): Promise<void> {
  const backend = resolveStoreBackend();

  if (backend === 'blob') {
    await writeContentStoreBlob(store);
    return;
  }

  await fs.mkdir(DATA_DIR, { recursive: true });
  await writeJsonFile(DATA_FILE, store);
}

function createSnapshot(
  slidesFile: RawSlidesFile,
  roomsFile: RoomConfigurationSet
): ContentSnapshot {
  return {
    slides: deepClone(slidesFile.ALL_SLIDES || []),
    rooms: deepClone(roomsFile.configurations || []),
    roomConfigVersion: roomsFile.version || '1.0.0',
    roomConfigLastUpdated: roomsFile.lastUpdated || todayIso(),
  };
}

async function createInitialStore(): Promise<ContentStore> {
  const [slidesPath, roomsPath] = await Promise.all([
    resolveConfigFile('slides.json'),
    resolveConfigFile('roomConfigurations.json'),
  ]);

  const [slidesFile, roomsFile] = await Promise.all([
    readJsonFile<RawSlidesFile>(slidesPath),
    readJsonFile<RoomConfigurationSet>(roomsPath),
  ]);

  const baseSnapshot = createSnapshot(slidesFile, roomsFile);
  const timestamp = nowIso();

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: timestamp,
    version: 1,
    slides: baseSnapshot.slides,
    rooms: baseSnapshot.rooms,
    roomConfigVersion: baseSnapshot.roomConfigVersion,
    roomConfigLastUpdated: baseSnapshot.roomConfigLastUpdated,
  };
}

async function ensureStoreInitialized(): Promise<void> {
  const existingRawStore = await readPersistedStoreRaw();
  if (!existingRawStore) {
    if (resolveStoreBackend() === 'file') {
      await fs.mkdir(DATA_DIR, { recursive: true });
    }
    const initialStore = await createInitialStore();
    await writePersistedStore(initialStore);
    return;
  }

  const normalized = normalizePersistedStore(existingRawStore);
  if (!normalized.store) {
    throw new Error('Content store has an unsupported format.');
  }
  if (normalized.migrated) {
    await writePersistedStore(normalized.store);
  }
}

export async function loadStore(): Promise<ContentStore> {
  await ensureStoreInitialized();

  const persistedRawStore = await readPersistedStoreRaw();
  if (!persistedRawStore) {
    throw new Error('Content store initialization failed.');
  }

  const normalized = normalizePersistedStore(persistedRawStore);
  if (!normalized.store) {
    throw new Error('Content store has an unsupported format.');
  }

  return normalized.store;
}

export async function saveStore(store: ContentStore): Promise<void> {
  await writePersistedStore(store);
}

async function mutateStore(
  mutator: (store: ContentStore) => boolean | void | Promise<boolean | void>
): Promise<ContentStore> {
  const store = await loadStore();
  const changed = (await mutator(store)) !== false;
  if (changed) {
    store.version = normalizePositiveInteger(store.version, 0) + 1;
    store.updatedAt = nowIso();
    await saveStore(store);
  }
  return store;
}

function bumpRoomConfigMetadata(store: ContentStore): void {
  store.roomConfigVersion = bumpPatchVersion(store.roomConfigVersion);
  store.roomConfigLastUpdated = todayIso();
}

function ensureRoomSlideReferences(room: RoomConfiguration, slides: Slide[]): void {
  const slideIds = new Set(slides.map((slide) => slide.id));
  const missingIds = room.slideSequence.filter((slideId) => !slideIds.has(slideId));
  if (missingIds.length === 0) {
    return;
  }

  throw new Error(
    `Room "${room.roomId}" references missing slide IDs: ${missingIds.join(', ')}`
  );
}

export function storeToSlidesPayload(store: ContentStore): SlidesPayload {
  return {
    ALL_SLIDES: store.slides,
    PITCH_SLIDES: [],
  };
}

export function storeToRoomPayload(store: ContentStore): RoomConfigurationSet {
  return {
    version: store.roomConfigVersion,
    lastUpdated: store.roomConfigLastUpdated,
    configurations: store.rooms,
  };
}

export async function getSlidesPayload(): Promise<SlidesPayload> {
  const store = await loadStore();
  return storeToSlidesPayload(store);
}

export async function getRoomsPayload(): Promise<RoomConfigurationSet> {
  const store = await loadStore();
  return storeToRoomPayload(store);
}

export async function getSlides(): Promise<Slide[]> {
  const store = await loadStore();
  return store.slides;
}

export async function getRooms(): Promise<RoomConfiguration[]> {
  const store = await loadStore();
  return store.rooms;
}

export async function getStoreSummary(): Promise<{
  schemaVersion: string;
  updatedAt: string;
  version: number;
  roomConfigVersion: string;
  roomConfigLastUpdated: string;
  slideCount: number;
  roomCount: number;
}> {
  const store = await loadStore();
  return {
    schemaVersion: store.schemaVersion,
    updatedAt: store.updatedAt,
    version: store.version,
    roomConfigVersion: store.roomConfigVersion,
    roomConfigLastUpdated: store.roomConfigLastUpdated,
    slideCount: store.slides.length,
    roomCount: store.rooms.length,
  };
}

export async function upsertSlide(
  slide: Slide
): Promise<{ created: boolean; store: ContentStore }> {
  let created = false;
  const store = await mutateStore((liveStore) => {
    const idx = liveStore.slides.findIndex((existing) => existing.id === slide.id);
    if (idx >= 0) {
      liveStore.slides[idx] = slide;
    } else {
      liveStore.slides.push(slide);
      created = true;
    }
    bumpRoomConfigMetadata(liveStore);
    return true;
  });
  return { created, store };
}

export async function patchSlide(
  slideId: string,
  patch: Partial<Slide>
): Promise<Slide | null> {
  let updatedSlide: Slide | null = null;
  await mutateStore((store) => {
    const idx = store.slides.findIndex((slide) => slide.id === slideId);
    if (idx === -1) {
      return false;
    }
    const current = store.slides[idx];
    const merged: Slide = {
      ...current,
      ...patch,
      pitchScript: {
        ...current.pitchScript,
        ...(patch.pitchScript || {}),
      },
    };
    store.slides[idx] = merged;
    bumpRoomConfigMetadata(store);
    updatedSlide = merged;
    return true;
  });
  return updatedSlide;
}

export async function deleteSlide(slideId: string): Promise<boolean> {
  let deleted = false;
  await mutateStore((store) => {
    const referencingRooms = store.rooms
      .filter((room) => room.slideSequence.includes(slideId))
      .map((room) => room.roomId);

    if (referencingRooms.length > 0) {
      throw new Error(
        `Cannot delete slide "${slideId}" because it is referenced by room(s): ${referencingRooms.join(', ')}`
      );
    }

    const before = store.slides.length;
    store.slides = store.slides.filter((slide) => slide.id !== slideId);
    deleted = store.slides.length < before;
    if (deleted) {
      bumpRoomConfigMetadata(store);
    }
    return deleted;
  });
  return deleted;
}

export async function upsertRoom(
  room: RoomConfiguration
): Promise<{ created: boolean; store: ContentStore }> {
  let created = false;
  const store = await mutateStore((liveStore) => {
    ensureRoomSlideReferences(room, liveStore.slides);
    const idx = liveStore.rooms.findIndex((existing) => existing.roomId === room.roomId);
    if (idx >= 0) {
      liveStore.rooms[idx] = room;
    } else {
      liveStore.rooms.push(room);
      created = true;
    }
    bumpRoomConfigMetadata(liveStore);
    return true;
  });
  return { created, store };
}

export async function patchRoom(
  roomId: string,
  patch: Partial<RoomConfiguration>
): Promise<RoomConfiguration | null> {
  let updatedRoom: RoomConfiguration | null = null;
  await mutateStore((store) => {
    const idx = store.rooms.findIndex((room) => room.roomId === roomId);
    if (idx === -1) {
      return false;
    }
    const current = store.rooms[idx];
    const merged: RoomConfiguration = {
      ...current,
      ...patch,
      components: {
        ...current.components,
        ...(patch.components || {}),
      },
      metadata: {
        ...(current.metadata || {}),
        ...(patch.metadata || {}),
      },
      slideSequence: patch.slideSequence || current.slideSequence,
    };
    ensureRoomSlideReferences(merged, store.slides);
    store.rooms[idx] = merged;
    bumpRoomConfigMetadata(store);
    updatedRoom = merged;
    return true;
  });
  return updatedRoom;
}

export async function deleteRoom(roomId: string): Promise<boolean> {
  let deleted = false;
  await mutateStore((store) => {
    const before = store.rooms.length;
    store.rooms = store.rooms.filter((room) => room.roomId !== roomId);
    deleted = store.rooms.length < before;
    if (deleted) {
      bumpRoomConfigMetadata(store);
    }
    return deleted;
  });
  return deleted;
}

export function validateRoomSequences(
  rooms: RoomConfiguration[],
  slides: Slide[]
): string[] {
  const slideIds = new Set(slides.map((slide) => slide.id));
  const missing: string[] = [];

  for (const room of rooms) {
    for (const slideId of room.slideSequence) {
      if (!slideIds.has(slideId)) {
        missing.push(`${room.roomId}:${slideId}`);
      }
    }
  }

  return missing;
}
