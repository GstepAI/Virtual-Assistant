"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStoreBackend = getStoreBackend;
exports.loadStore = loadStore;
exports.saveStore = saveStore;
exports.storeToSlidesPayload = storeToSlidesPayload;
exports.storeToRoomPayload = storeToRoomPayload;
exports.getSlidesPayload = getSlidesPayload;
exports.getRoomsPayload = getRoomsPayload;
exports.getSlides = getSlides;
exports.getRooms = getRooms;
exports.getStoreSummary = getStoreSummary;
exports.upsertSlide = upsertSlide;
exports.patchSlide = patchSlide;
exports.deleteSlide = deleteSlide;
exports.upsertRoom = upsertRoom;
exports.patchRoom = patchRoom;
exports.deleteRoom = deleteRoom;
exports.validateRoomSequences = validateRoomSequences;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const blobStorage_1 = require("./blobStorage");
const API_ROOT = path_1.default.resolve(__dirname, '..');
const PROJECT_ROOT = path_1.default.resolve(API_ROOT, '..');
const DATA_DIR = path_1.default.join(API_ROOT, 'data');
const DATA_FILE = path_1.default.join(DATA_DIR, 'content-store.json');
const IS_AZURE_RUNTIME = Boolean(process.env.WEBSITE_HOSTNAME || process.env.WEBSITE_INSTANCE_ID);
let cachedStoreBackend = null;
const CURRENT_SCHEMA_VERSION = '2.0.0';
const CONFIG_ROOT_CANDIDATES = [
    process.env.CONTENT_CONFIG_DIR,
    API_ROOT,
    PROJECT_ROOT,
    process.cwd(),
].filter((candidate) => Boolean(candidate));
async function resolveConfigFile(fileName) {
    const attempts = [];
    for (const root of CONFIG_ROOT_CANDIDATES) {
        const candidatePath = path_1.default.join(path_1.default.resolve(root), 'config', fileName);
        attempts.push(candidatePath);
        try {
            await fs_1.promises.access(candidatePath);
            return candidatePath;
        }
        catch {
            // Continue trying fallback paths.
        }
    }
    throw new Error(`Unable to locate config file "${fileName}". Looked in: ${attempts.join(', ')}`);
}
function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}
function nowIso() {
    return new Date().toISOString();
}
function todayIso() {
    return nowIso().slice(0, 10);
}
function bumpPatchVersion(version) {
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
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function normalizeString(value, fallback) {
    return typeof value === 'string' && value.trim() ? value : fallback;
}
function normalizePositiveInteger(value, fallback) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fallback;
    }
    const normalized = Math.floor(value);
    return normalized > 0 ? normalized : fallback;
}
function normalizeSnapshot(rawSnapshot, fallbackVersion, fallbackLastUpdated) {
    const snapshot = isRecord(rawSnapshot) ? rawSnapshot : {};
    const slides = Array.isArray(snapshot.slides) ? deepClone(snapshot.slides) : [];
    const rooms = Array.isArray(snapshot.rooms)
        ? deepClone(snapshot.rooms)
        : [];
    return {
        slides,
        rooms,
        roomConfigVersion: normalizeString(snapshot.roomConfigVersion, fallbackVersion),
        roomConfigLastUpdated: normalizeString(snapshot.roomConfigLastUpdated, fallbackLastUpdated),
    };
}
function normalizePersistedStore(rawStore) {
    if (!isRecord(rawStore)) {
        return { store: null, migrated: false };
    }
    const now = nowIso();
    const today = now.slice(0, 10);
    const hasLiveShape = Array.isArray(rawStore.slides) &&
        Array.isArray(rawStore.rooms) &&
        'roomConfigVersion' in rawStore &&
        'roomConfigLastUpdated' in rawStore;
    if (hasLiveShape) {
        const store = {
            schemaVersion: normalizeString(rawStore.schemaVersion, CURRENT_SCHEMA_VERSION),
            updatedAt: normalizeString(rawStore.updatedAt, now),
            version: normalizePositiveInteger(rawStore.version, 1),
            slides: deepClone(rawStore.slides),
            rooms: deepClone(rawStore.rooms),
            roomConfigVersion: normalizeString(rawStore.roomConfigVersion, '1.0.0'),
            roomConfigLastUpdated: normalizeString(rawStore.roomConfigLastUpdated, today),
        };
        const migrated = !('version' in rawStore) ||
            !('schemaVersion' in rawStore) ||
            store.schemaVersion !== rawStore.schemaVersion;
        return { store, migrated };
    }
    const hasLegacyShape = isRecord(rawStore.draft) || isRecord(rawStore.published);
    if (!hasLegacyShape) {
        return { store: null, migrated: false };
    }
    const fallbackVersion = '1.0.0';
    const fallbackLastUpdated = normalizeString(rawStore.updatedAt, normalizeString(rawStore.publishedAt, today)).slice(0, 10);
    // Prefer legacy draft data so pending edits are not lost during migration.
    const sourceSnapshot = isRecord(rawStore.draft) ? rawStore.draft : rawStore.published;
    const snapshot = normalizeSnapshot(sourceSnapshot, fallbackVersion, fallbackLastUpdated);
    const store = {
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
async function readJsonFile(filePath) {
    const raw = await fs_1.promises.readFile(filePath, 'utf8');
    return JSON.parse(raw);
}
async function writeJsonFile(filePath, value) {
    const serialized = JSON.stringify(value, null, 2);
    await fs_1.promises.writeFile(filePath, `${serialized}\n`, 'utf8');
}
function resolveStoreBackend() {
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
        if (!(0, blobStorage_1.isBlobStorageConfigured)()) {
            throw new Error(`CONTENT_STORE_BACKEND is "blob" but blob storage is not configured. ${(0, blobStorage_1.getBlobStorageConfigHint)()}`);
        }
        cachedStoreBackend = 'blob';
        return cachedStoreBackend;
    }
    if ((0, blobStorage_1.isBlobStorageConfigured)()) {
        cachedStoreBackend = 'blob';
        return cachedStoreBackend;
    }
    if (IS_AZURE_RUNTIME) {
        throw new Error(`Content store persistence requires blob storage in Azure. ${(0, blobStorage_1.getBlobStorageConfigHint)()}`);
    }
    cachedStoreBackend = 'file';
    return cachedStoreBackend;
}
function getStoreBackend() {
    return resolveStoreBackend();
}
async function readPersistedStoreRaw() {
    const backend = resolveStoreBackend();
    if (backend === 'blob') {
        return (0, blobStorage_1.readContentStoreBlob)();
    }
    try {
        await fs_1.promises.access(DATA_FILE);
    }
    catch {
        return null;
    }
    return readJsonFile(DATA_FILE);
}
async function writePersistedStore(store) {
    const backend = resolveStoreBackend();
    if (backend === 'blob') {
        await (0, blobStorage_1.writeContentStoreBlob)(store);
        return;
    }
    await fs_1.promises.mkdir(DATA_DIR, { recursive: true });
    await writeJsonFile(DATA_FILE, store);
}
function createSnapshot(slidesFile, roomsFile) {
    return {
        slides: deepClone(slidesFile.ALL_SLIDES || []),
        rooms: deepClone(roomsFile.configurations || []),
        roomConfigVersion: roomsFile.version || '1.0.0',
        roomConfigLastUpdated: roomsFile.lastUpdated || todayIso(),
    };
}
async function createInitialStore() {
    const [slidesPath, roomsPath] = await Promise.all([
        resolveConfigFile('slides.json'),
        resolveConfigFile('roomConfigurations.json'),
    ]);
    const [slidesFile, roomsFile] = await Promise.all([
        readJsonFile(slidesPath),
        readJsonFile(roomsPath),
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
async function ensureStoreInitialized() {
    const existingRawStore = await readPersistedStoreRaw();
    if (!existingRawStore) {
        if (resolveStoreBackend() === 'file') {
            await fs_1.promises.mkdir(DATA_DIR, { recursive: true });
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
async function loadStore() {
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
async function saveStore(store) {
    await writePersistedStore(store);
}
async function mutateStore(mutator) {
    const store = await loadStore();
    const changed = (await mutator(store)) !== false;
    if (changed) {
        store.version = normalizePositiveInteger(store.version, 0) + 1;
        store.updatedAt = nowIso();
        await saveStore(store);
    }
    return store;
}
function bumpRoomConfigMetadata(store) {
    store.roomConfigVersion = bumpPatchVersion(store.roomConfigVersion);
    store.roomConfigLastUpdated = todayIso();
}
function ensureRoomSlideReferences(room, slides) {
    const slideIds = new Set(slides.map((slide) => slide.id));
    const missingIds = room.slideSequence.filter((slideId) => !slideIds.has(slideId));
    if (missingIds.length === 0) {
        return;
    }
    throw new Error(`Room "${room.roomId}" references missing slide IDs: ${missingIds.join(', ')}`);
}
function storeToSlidesPayload(store) {
    return {
        ALL_SLIDES: store.slides,
        PITCH_SLIDES: [],
    };
}
function storeToRoomPayload(store) {
    return {
        version: store.roomConfigVersion,
        lastUpdated: store.roomConfigLastUpdated,
        configurations: store.rooms,
    };
}
async function getSlidesPayload() {
    const store = await loadStore();
    return storeToSlidesPayload(store);
}
async function getRoomsPayload() {
    const store = await loadStore();
    return storeToRoomPayload(store);
}
async function getSlides() {
    const store = await loadStore();
    return store.slides;
}
async function getRooms() {
    const store = await loadStore();
    return store.rooms;
}
async function getStoreSummary() {
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
async function upsertSlide(slide) {
    let created = false;
    const store = await mutateStore((liveStore) => {
        const idx = liveStore.slides.findIndex((existing) => existing.id === slide.id);
        if (idx >= 0) {
            liveStore.slides[idx] = slide;
        }
        else {
            liveStore.slides.push(slide);
            created = true;
        }
        bumpRoomConfigMetadata(liveStore);
        return true;
    });
    return { created, store };
}
async function patchSlide(slideId, patch) {
    let updatedSlide = null;
    await mutateStore((store) => {
        const idx = store.slides.findIndex((slide) => slide.id === slideId);
        if (idx === -1) {
            return false;
        }
        const current = store.slides[idx];
        const merged = {
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
async function deleteSlide(slideId) {
    let deleted = false;
    await mutateStore((store) => {
        const referencingRooms = store.rooms
            .filter((room) => room.slideSequence.includes(slideId))
            .map((room) => room.roomId);
        if (referencingRooms.length > 0) {
            throw new Error(`Cannot delete slide "${slideId}" because it is referenced by room(s): ${referencingRooms.join(', ')}`);
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
async function upsertRoom(room) {
    let created = false;
    const store = await mutateStore((liveStore) => {
        ensureRoomSlideReferences(room, liveStore.slides);
        const idx = liveStore.rooms.findIndex((existing) => existing.roomId === room.roomId);
        if (idx >= 0) {
            liveStore.rooms[idx] = room;
        }
        else {
            liveStore.rooms.push(room);
            created = true;
        }
        bumpRoomConfigMetadata(liveStore);
        return true;
    });
    return { created, store };
}
async function patchRoom(roomId, patch) {
    let updatedRoom = null;
    await mutateStore((store) => {
        const idx = store.rooms.findIndex((room) => room.roomId === roomId);
        if (idx === -1) {
            return false;
        }
        const current = store.rooms[idx];
        const merged = {
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
async function deleteRoom(roomId) {
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
function validateRoomSequences(rooms, slides) {
    const slideIds = new Set(slides.map((slide) => slide.id));
    const missing = [];
    for (const room of rooms) {
        for (const slideId of room.slideSequence) {
            if (!slideIds.has(slideId)) {
                missing.push(`${room.roomId}:${slideId}`);
            }
        }
    }
    return missing;
}
