import React, { useEffect, useMemo, useState } from 'react';
import type { Slide } from '../types';
import type { RoomConfiguration } from '../types/roomConfig';
import { resolveMediaAssetUrl } from '../utils/mediaUrl';
import {
  ApiError,
  deleteKnowledgeBaseDocument,
  deleteRoom,
  deleteSlide,
  getAadLoginUrl,
  getAdminContent,
  getAuthMe,
  getKnowledgeBaseDocuments,
  patchRoom,
  patchSlide,
  publishContent,
  reorderRoomSlides,
  upsertRoom,
  requestUploadUrl,
  triggerIndexerRefresh,
  uploadKnowledgeBaseDocument,
  uploadSignedMedia,
  upsertSlide,
  type AdminContentResponse,
  type KnowledgeBaseDocument,
  type KnowledgeBaseTag,
} from '../services/adminContentService';
import { ArrowLeftIcon, CloseIcon, SunIcon, MoonIcon } from './icons';
import * as ttsService from '../services/ttsService';
import SlidePicker from './SlidePicker';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onContentUpdated?: () => void | Promise<void>;
}

type AdminTab = 'slides' | 'rooms' | 'knowledge-base' | 'live';
type SlideMediaField = 'image' | 'video';

interface LogEntry {
  id: string;
  timestamp: string;
  action: string;
  status: 'success' | 'error' | 'info';
  details?: string;
}

const SCRIPT_FIELDS: Array<{ key: 'en' | 'pt-BR'; badges?: Array<{ label: string; darkColor: string; lightColor: string }>; label: string; darkColor: string; lightColor: string }> = [
  {
    key: 'en',
    label: 'EN',
    darkColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    lightColor: 'bg-blue-100 text-blue-700 border-blue-300',
    badges: [
      { label: 'en-US', darkColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30', lightColor: 'bg-blue-100 text-blue-700 border-blue-300' },
      { label: 'en-UK', darkColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30', lightColor: 'bg-purple-100 text-purple-700 border-purple-300' },
    ],
  },
  { key: 'pt-BR', label: 'pt-BR', darkColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', lightColor: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
];

const TABS: Array<{ key: AdminTab; label: string; icon: React.ReactNode }> = [
  {
    key: 'slides',
    label: 'Slides',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
  },
  {
    key: 'rooms',
    label: 'Rooms',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    key: 'knowledge-base',
    label: 'Knowledge Base',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-8.25a2.25 2.25 0 00-2.25-2.25h-10.5A2.25 2.25 0 004.5 6v12a2.25 2.25 0 002.25 2.25h6.75M14.25 17.25h6m-3-3v6" />
      </svg>
    ),
  },
  {
    key: 'live',
    label: 'Publish',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
      </svg>
    ),
  },
];

const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_UPLOAD_BYTES = 200 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/webm']);
const KNOWLEDGE_BASE_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const KNOWLEDGE_BASE_ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.ppt', '.pptx']);
const KNOWLEDGE_BASE_ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/octet-stream',
]);
const KNOWLEDGE_BASE_TAG_OPTIONS: KnowledgeBaseTag[] = [
  'funds',
  'about',
  'general',
  'golden-visa',
];
const KNOWLEDGE_BASE_ALL_TAGS = '__all__';
const ALL_SLIDE_CATEGORIES = '__all__';
const UNCATEGORIZED_SLIDE_CATEGORY = 'Uncategorized';

function formatMegabytes(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10}MB`;
}

function toPathSegments(raw: string): string[] {
  const value = raw.trim();
  if (!value) {
    return [];
  }

  try {
    const parsed = new URL(value, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    return parsed.pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
  } catch {
    return value
      .split(/[?#]/)[0]
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
  }
}

function inferSlideCategory(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const segments = toPathSegments(candidate);
    if (segments.length === 0) {
      continue;
    }

    const legacyMarkerIndex = segments.findIndex((segment) => {
      const normalized = segment.toLowerCase();
      return normalized === 'slides' || normalized === 'videos';
    });
    if (legacyMarkerIndex >= 0 && segments[legacyMarkerIndex + 1]) {
      const inferred = segments[legacyMarkerIndex + 1];
      if (inferred.toLowerCase() !== 'uploads') {
        return inferred;
      }
    }

    const mediaFolderIndex = segments.findIndex((segment) => {
      const normalized = segment.toLowerCase();
      return normalized === 'images' || normalized === 'videos';
    });
    if (mediaFolderIndex > 0) {
      const inferred = segments[mediaFolderIndex - 1];
      if (inferred.toLowerCase() !== 'uploads') {
        return inferred;
      }
    }
  }

  return '';
}

function getMediaFileName(raw: string): string {
  const segments = toPathSegments(raw);
  return segments[segments.length - 1] || raw.trim();
}

function getSlideCategoryFromSlide(slide: Slide): string {
  const inferred = inferSlideCategory(slide.imageUrl, slide.videoUrl).trim();
  return inferred || UNCATEGORIZED_SLIDE_CATEGORY;
}

function getFileExtension(fileName: string): string {
  const normalized = fileName.trim().toLowerCase();
  const dotIndex = normalized.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === normalized.length - 1) {
    return '';
  }
  return normalized.slice(dotIndex);
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) {
    return `${Math.round((sizeBytes / (1024 * 1024)) * 10) / 10} MB`;
  }
  if (sizeBytes >= 1024) {
    return `${Math.round((sizeBytes / 1024) * 10) / 10} KB`;
  }
  return `${sizeBytes} B`;
}

function formatDateTime(raw: string): string {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  return parsed.toLocaleString();
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = reader.result;
      if (typeof value !== 'string') {
        reject(new Error('Failed to read file.'));
        return;
      }
      const base64 = value.split(',')[1];
      if (!base64) {
        reject(new Error('Invalid file encoding.'));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to convert file.'));
    reader.readAsDataURL(file);
  });
}

function toMediaUrl(raw: string): string {
  return resolveMediaAssetUrl(raw) || '';
}

function createLogEntry(action: string, status: 'success' | 'error' | 'info', details?: string): LogEntry {
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toLocaleTimeString(),
    action,
    status,
    details,
  };
}

const Spinner: React.FC = () => (
  <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

interface FieldLabelProps {
  htmlFor?: string;
  children: React.ReactNode;
  required?: boolean;
}

const FieldLabel: React.FC<FieldLabelProps> = ({ htmlFor, children, required }) => (
  <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
    {children}
    {required && <span className="ml-1 text-red-400">*</span>}
  </label>
);

const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose, onContentUpdated }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('slides');
  const [authProfiles, setAuthProfiles] = useState<any[]>([]);
  const [isForbidden, setIsForbidden] = useState(false);
  const [adminContent, setAdminContent] = useState<AdminContentResponse | null>(null);
  const [contentSource, setContentSource] = useState<'api' | 'blob' | 'file' | 'unknown'>('unknown');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  // Add scrollbar styles
  const scrollbarStyles = `
    .custom-scrollbar::-webkit-scrollbar {
      width: 8px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: rgba(100, 116, 139, 0.5);
      border-radius: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: rgba(100, 116, 139, 0.8);
    }
  `;

  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem('adminTheme') === 'dark';
    } catch {
      return false;
    }
  });

const [slideSearch, setSlideSearch] = useState('');
  const [activeSlideCategoryFilter, setActiveSlideCategoryFilter] = useState<string>(ALL_SLIDE_CATEGORIES);
  const [selectedSlideId, setSelectedSlideId] = useState('');
  const [isCreatingSlide, setIsCreatingSlide] = useState(false);
  const [slideIdInput, setSlideIdInput] = useState('');
  const [slideTitle, setSlideTitle] = useState('');
  const [slideDescription, setSlideDescription] = useState('');
  const [slideImageUrl, setSlideImageUrl] = useState('');
  const [slideVideoUrl, setSlideVideoUrl] = useState('');
  const [slideQnA, setSlideQnA] = useState(false);
  const [slideScriptEn, setSlideScriptEn] = useState('');
  const [slideScriptPtBr, setSlideScriptPtBr] = useState('');
  const [slideCategory, setSlideCategory] = useState('');
  const [slideImageFile, setSlideImageFile] = useState<File | null>(null);
  const [slideVideoFile, setSlideVideoFile] = useState<File | null>(null);
  const [isSlideImageUploading, setIsSlideImageUploading] = useState(false);
  const [isSlideVideoUploading, setIsSlideVideoUploading] = useState(false);
  const [slideImageUploadProgress, setSlideImageUploadProgress] = useState(0);
  const [slideVideoUploadProgress, setSlideVideoUploadProgress] = useState(0);

  const [roomSearch, setRoomSearch] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [newRoomId, setNewRoomId] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomDescription, setRoomDescription] = useState('');
  const [roomSlideSequence, setRoomSlideSequence] = useState<string[]>([]);
  const [selectedRoomSlideId, setSelectedRoomSlideId] = useState('');
  const [editingScriptField, setEditingScriptField] = useState<'en' | 'pt-BR' | null>(null);
  const [editingScriptDraft, setEditingScriptDraft] = useState('');

  const [knowledgeBaseDocuments, setKnowledgeBaseDocuments] = useState<KnowledgeBaseDocument[]>([]);
  const [knowledgeBaseSearch, setKnowledgeBaseSearch] = useState('');
  const [knowledgeBaseTagFilter, setKnowledgeBaseTagFilter] = useState<string>(KNOWLEDGE_BASE_ALL_TAGS);
  const [knowledgeBaseUploadFile, setKnowledgeBaseUploadFile] = useState<File | null>(null);
  const [knowledgeBaseUploadDescription, setKnowledgeBaseUploadDescription] = useState('');
  const [knowledgeBaseUploadTag, setKnowledgeBaseUploadTag] = useState<KnowledgeBaseTag>('general');
  const [knowledgeBaseUploadProgress, setKnowledgeBaseUploadProgress] = useState(0);
  const [isKnowledgeBaseUploading, setIsKnowledgeBaseUploading] = useState(false);
  const [knowledgeBaseDeleteTarget, setKnowledgeBaseDeleteTarget] = useState<KnowledgeBaseDocument | null>(null);
  const [isKnowledgeBaseDeleting, setIsKnowledgeBaseDeleting] = useState(false);

  const [deleteSlideConfirm, setDeleteSlideConfirm] = useState(false);
  const [isDeletingSlide, setIsDeletingSlide] = useState(false);
  const [deleteRoomConfirm, setDeleteRoomConfirm] = useState(false);
  const [isDeletingRoom, setIsDeletingRoom] = useState(false);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  const isAuthenticated = authProfiles.length > 0;
  const isLocalHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const loginUrl = getAadLoginUrl();
  const logoutThenLoginUrl = `/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(getAadLoginUrl())}`;

  const liveSlides = adminContent?.content.slides || [];
  const liveRooms = adminContent?.content.rooms || [];

  const sortedSlides = useMemo(
    () => [...liveSlides].sort((a, b) => a.id.localeCompare(b.id)),
    [liveSlides]
  );
  const sortedRooms = useMemo(
    () => [...liveRooms].sort((a, b) => a.roomId.localeCompare(b.roomId)),
    [liveRooms]
  );

  const slideCategoryById = useMemo(() => {
    const map = new Map<string, string>();
    sortedSlides.forEach((slide) => {
      map.set(slide.id, getSlideCategoryFromSlide(slide));
    });
    return map;
  }, [sortedSlides]);

  const slideCategoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    sortedSlides.forEach((slide) => {
      const category =
        slideCategoryById.get(slide.id) || UNCATEGORIZED_SLIDE_CATEGORY;
      counts.set(category, (counts.get(category) || 0) + 1);
    });

    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => ({ name, count }));
  }, [slideCategoryById, sortedSlides]);

  const slidesInActiveCategory = useMemo(() => {
    if (activeSlideCategoryFilter === ALL_SLIDE_CATEGORIES) {
      return sortedSlides;
    }
    return sortedSlides.filter(
      (slide) =>
        (slideCategoryById.get(slide.id) || UNCATEGORIZED_SLIDE_CATEGORY) ===
        activeSlideCategoryFilter
    );
  }, [activeSlideCategoryFilter, slideCategoryById, sortedSlides]);

  const filteredSlides = useMemo(() => {
    const query = slideSearch.trim().toLowerCase();
    if (!query) {
      return slidesInActiveCategory;
    }
    return slidesInActiveCategory.filter((slide) =>
      `${slide.id} ${slide.title} ${slide.description}`.toLowerCase().includes(query)
    );
  }, [slideSearch, slidesInActiveCategory]);

  const activeCategorySlideCount = useMemo(() => {
    if (activeSlideCategoryFilter === ALL_SLIDE_CATEGORIES) {
      return sortedSlides.length;
    }
    return (
      slideCategoryOptions.find(
        (category) => category.name === activeSlideCategoryFilter
      )?.count || 0
    );
  }, [activeSlideCategoryFilter, slideCategoryOptions, sortedSlides.length]);

  const filteredRooms = useMemo(() => {
    const query = roomSearch.trim().toLowerCase();
    if (!query) {
      return sortedRooms;
    }
    return sortedRooms.filter((room) =>
      `${room.roomId} ${room.name} ${room.description}`.toLowerCase().includes(query)
    );
  }, [roomSearch, sortedRooms]);

  const selectedSlide = useMemo(
    () => liveSlides.find((slide) => slide.id === selectedSlideId) || null,
    [liveSlides, selectedSlideId]
  );
  const selectedRoom = useMemo(
    () => liveRooms.find((room) => room.roomId === selectedRoomId) || null,
    [liveRooms, selectedRoomId]
  );
  const slideMap = useMemo(() => {
    const map = new Map<string, Slide>();
    liveSlides.forEach((slide) => map.set(slide.id, slide));
    return map;
  }, [liveSlides]);
  const selectedRoomSlide = useMemo(
    () => slideMap.get(selectedRoomSlideId) || null,
    [slideMap, selectedRoomSlideId]
  );

  const knowledgeBaseTagCounts = useMemo(() => {
    const counts = new Map<KnowledgeBaseTag, number>();
    knowledgeBaseDocuments.forEach((document) => {
      counts.set(document.tag, (counts.get(document.tag) || 0) + 1);
    });
    return counts;
  }, [knowledgeBaseDocuments]);

  const filteredKnowledgeBaseDocuments = useMemo(() => {
    const query = knowledgeBaseSearch.trim().toLowerCase();
    return knowledgeBaseDocuments.filter((document) => {
      if (
        knowledgeBaseTagFilter !== KNOWLEDGE_BASE_ALL_TAGS &&
        document.tag !== knowledgeBaseTagFilter
      ) {
        return false;
      }
      if (!query) {
        return true;
      }
      return `${document.fileName} ${document.description}`
        .toLowerCase()
        .includes(query);
    });
  }, [knowledgeBaseDocuments, knowledgeBaseSearch, knowledgeBaseTagFilter]);

  const isSlideMediaUploading = isSlideImageUploading || isSlideVideoUploading;

  const refreshAdminData = async (preferred?: { slideId?: string; roomId?: string }) => {
    setIsLoading(true);
    setError('');
    try {
      const [profiles, content] = await Promise.all([getAuthMe(), getAdminContent()]);
      setAuthProfiles(profiles);
      setIsForbidden(false);
      setAdminContent(content);
      setLogs(prev => [createLogEntry('Content loaded', 'success', `${content.content.slides.length} slides, ${content.content.rooms.length} rooms`), ...prev.slice(0, 49)]);

      if (preferred?.slideId) {
        setSelectedSlideId(preferred.slideId);
      } else if (!isCreatingSlide) {
        const fallbackSlideId =
          content.content.slides.find((slide) => slide.id === selectedSlideId)?.id ||
          content.content.slides[0]?.id ||
          '';
        setSelectedSlideId(fallbackSlideId);
      }

      const fallbackRoomId =
        preferred?.roomId ||
        content.content.rooms.find((room) => room.roomId === selectedRoomId)?.roomId ||
        content.content.rooms[0]?.roomId ||
        '';
      setSelectedRoomId(fallbackRoomId);
    } catch (refreshError: any) {
      if (refreshError instanceof ApiError && refreshError.status === 403) {
        const profiles = await getAuthMe().catch(() => []);
        setAuthProfiles([]);
        setIsForbidden(profiles.length > 0);
        setError('');
      } else {
        setError(refreshError?.message || 'Failed to load admin content.');
        setLogs(prev => [createLogEntry('Content load failed', 'error', refreshError?.message), ...prev.slice(0, 49)]);
        try {
          setAuthProfiles(await getAuthMe());
        } catch {
          setAuthProfiles([]);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const refreshKnowledgeBaseDocuments = async (
    options?: { silent?: boolean }
  ) => {
    if (!options?.silent) {
      setIsLoading(true);
    }
    setError('');
    try {
      const documents = await getKnowledgeBaseDocuments();
      const sortedDocuments = [...documents].sort((a, b) => {
        const byDate =
          new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
        if (byDate !== 0) {
          return byDate;
        }
        return a.fileName.localeCompare(b.fileName);
      });
      setKnowledgeBaseDocuments(sortedDocuments);
    } catch (knowledgeError: any) {
      setError(
        knowledgeError?.message || 'Failed to load knowledge base documents.'
      );
      setLogs((prev) => [
        createLogEntry(
          'Knowledge base load failed',
          'error',
          knowledgeError?.message
        ),
        ...prev.slice(0, 49),
      ]);
    } finally {
      if (!options?.silent) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    refreshAdminData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !adminContent || activeTab !== 'knowledge-base') {
      return;
    }
    refreshKnowledgeBaseDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, adminContent, activeTab]);

  useEffect(() => {
    if (isCreatingSlide) {
      return;
    }
    if (!selectedSlide) {
      setSlideIdInput('');
      setSlideTitle('');
      setSlideDescription('');
      setSlideImageUrl('');
      setSlideVideoUrl('');
      setSlideQnA(false);
      setSlideScriptEn('');
      setSlideScriptPtBr('');
      setSlideCategory('');
      setSlideImageFile(null);
      setSlideVideoFile(null);
      setSlideImageUploadProgress(0);
      setSlideVideoUploadProgress(0);
      setIsSlideImageUploading(false);
      setIsSlideVideoUploading(false);
      return;
    }
    setSlideIdInput(selectedSlide.id);
    setSlideTitle(selectedSlide.title || '');
    setSlideDescription(selectedSlide.description || '');
    setSlideImageUrl(selectedSlide.imageUrl || '');
    setSlideVideoUrl(selectedSlide.videoUrl || '');
    setSlideQnA(Boolean(selectedSlide.QnA));
    setSlideScriptEn(selectedSlide.pitchScript['en-US'] || selectedSlide.pitchScript['en-UK'] || '');
    setSlideScriptPtBr(selectedSlide.pitchScript['pt-BR'] || '');
    setSlideCategory(inferSlideCategory(selectedSlide.imageUrl, selectedSlide.videoUrl));
    setSlideImageFile(null);
    setSlideVideoFile(null);
    setSlideImageUploadProgress(0);
    setSlideVideoUploadProgress(0);
    setIsSlideImageUploading(false);
    setIsSlideVideoUploading(false);
  }, [isCreatingSlide, selectedSlide]);

  useEffect(() => {
    if (!selectedRoom) {
      setRoomName('');
      setRoomDescription('');
      setRoomSlideSequence([]);
      setSelectedRoomSlideId('');
      return;
    }
    const sequence = selectedRoom.slideSequence || [];
    setRoomName(selectedRoom.name || '');
    setRoomDescription(selectedRoom.description || '');
    setRoomSlideSequence(sequence);
    setSelectedRoomSlideId(sequence[0] || '');
  }, [selectedRoom]);

  useEffect(() => {
    if (!roomSlideSequence.length) {
      setSelectedRoomSlideId('');
      return;
    }
    if (!roomSlideSequence.includes(selectedRoomSlideId)) {
      setSelectedRoomSlideId(roomSlideSequence[0]);
    }
  }, [roomSlideSequence, selectedRoomSlideId]);

  useEffect(() => {
    if (activeSlideCategoryFilter === ALL_SLIDE_CATEGORIES) {
      return;
    }
    const exists = slideCategoryOptions.some(
      (category) => category.name === activeSlideCategoryFilter
    );
    if (!exists) {
      setActiveSlideCategoryFilter(ALL_SLIDE_CATEGORIES);
    }
  }, [activeSlideCategoryFilter, slideCategoryOptions]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const clearSlideForm = () => {
    setSlideIdInput('');
    setSlideTitle('');
    setSlideDescription('');
    setSlideImageUrl('');
    setSlideVideoUrl('');
    setSlideQnA(false);
    setSlideScriptEn('');
    setSlideScriptPtBr('');
    setSlideCategory('');
    setSlideImageFile(null);
    setSlideVideoFile(null);
    setSlideImageUploadProgress(0);
    setSlideVideoUploadProgress(0);
    setIsSlideImageUploading(false);
    setIsSlideVideoUploading(false);
  };

  const beginCreateSlide = () => {
    const defaultCategory =
      activeSlideCategoryFilter === ALL_SLIDE_CATEGORIES
        ? ''
        : activeSlideCategoryFilter;
    setIsCreatingSlide(true);
    setSelectedSlideId('');
    clearSlideForm();
    setSlideCategory(defaultCategory);
    setError('');
    setStatusMessage('');
  };

  const buildSlidePayload = (): Slide | null => {
    const id = slideIdInput.trim();
    const title = slideTitle.trim();
    const description = slideDescription.trim();
    const imageUrl = slideImageUrl.trim();
    const videoUrl = slideVideoUrl.trim();
    if (!id || !title || !description || !imageUrl) {
      setError('Slide ID, title, description, and image URL are required.');
      return null;
    }
    const payload: Slide = {
      id,
      title,
      description,
      imageUrl,
      QnA: slideQnA,
      pitchScript: {
        'en-US': slideScriptEn,
        'en-UK': slideScriptEn,
        'pt-BR': slideScriptPtBr,
      },
    };
    if (videoUrl) {
      payload.videoUrl = videoUrl;
    }
    return payload;
  };

  const notifyLiveContentChanged = async () => {
    if (!onContentUpdated) {
      return;
    }
    try {
      await onContentUpdated();
    } catch (callbackError) {
      console.warn('[AdminPanel] onContentUpdated callback failed', callbackError);
    }
  };

  const handleSaveSlide = async () => {
    if (isSlideMediaUploading) {
      setError('Wait for media upload to finish before saving the slide.');
      return;
    }

    const payload = buildSlidePayload();
    if (!payload) {
      return;
    }
    setStatusMessage('');
    setError('');
    setIsLoading(true);
    try {
      if (isCreatingSlide || !selectedSlide) {
        if (liveSlides.some((slide) => slide.id === payload.id)) {
          throw new Error(`Slide ID "${payload.id}" already exists.`);
        }
        await upsertSlide(payload);
        setIsCreatingSlide(false);
        setStatusMessage(`Created slide "${payload.id}".`);
        setLogs(prev => [createLogEntry('Slide created', 'success', payload.id), ...prev.slice(0, 49)]);
        await refreshAdminData({ slideId: payload.id });
        await notifyLiveContentChanged();
        return;
      }

      if (payload.id === selectedSlide.id) {
        await patchSlide(selectedSlide.id, {
          title: payload.title,
          description: payload.description,
          imageUrl: payload.imageUrl,
          videoUrl: payload.videoUrl,
          QnA: payload.QnA,
          pitchScript: payload.pitchScript,
        } as Partial<Slide>);
        setStatusMessage(`Saved slide "${payload.id}".`);
        setLogs(prev => [createLogEntry('Slide updated', 'success', payload.id), ...prev.slice(0, 49)]);
        await refreshAdminData({ slideId: payload.id });
        await notifyLiveContentChanged();
        return;
      }

      if (liveSlides.some((slide) => slide.id === payload.id)) {
        throw new Error(`Slide ID "${payload.id}" already exists.`);
      }

      await upsertSlide(payload);
      const impactedRooms = liveRooms.filter((room) =>
        room.slideSequence.includes(selectedSlide.id)
      );
      await Promise.all(
        impactedRooms.map((room) =>
          patchRoom(room.roomId, {
            slideSequence: room.slideSequence.map((id) => (id === selectedSlide.id ? payload.id : id)),
          } as Partial<RoomConfiguration>)
        )
      );
      await deleteSlide(selectedSlide.id);
      setStatusMessage(
        `Renamed "${selectedSlide.id}" to "${payload.id}" and updated ${impactedRooms.length} room(s).`
      );
      setLogs(prev => [createLogEntry('Slide renamed', 'success', `${selectedSlide.id} -> ${payload.id}`), ...prev.slice(0, 49)]);
      setIsCreatingSlide(false);
      await refreshAdminData({ slideId: payload.id });
      await notifyLiveContentChanged();
    } catch (saveError: any) {
      setError(saveError?.message || 'Failed to save slide.');
      setLogs(prev => [createLogEntry('Slide save failed', 'error', saveError?.message), ...prev.slice(0, 49)]);
    } finally {
      setIsLoading(false);
    }
  };

  const beginCreateRoom = () => {
    setIsCreatingRoom(true);
    setSelectedRoomId('');
    setNewRoomId('');
    setRoomName('');
    setRoomDescription('');
    setRoomSlideSequence([]);
    setError('');
    setStatusMessage('');
  };

  const handleCreateRoom = async () => {
    const id = newRoomId.trim().toUpperCase();
    const name = roomName.trim();
    const description = roomDescription.trim();
    if (!id || !name || !description) {
      setError('Room ID, name, and description are required.');
      return;
    }
    setStatusMessage('');
    setError('');
    setIsLoading(true);
    try {
      await upsertRoom({
        roomId: id,
        name,
        description,
        components: { prefix: 'BC', audience: 'INT', module: 'A00', focus: 'NXT' },
        slideSequence: roomSlideSequence,
      });
      setIsCreatingRoom(false);
      setLogs(prev => [createLogEntry('Room created', 'success', id), ...prev.slice(0, 49)]);
      await refreshAdminData({ roomId: id });
      await notifyLiveContentChanged();
    } catch (createError: any) {
      setError(createError?.message || 'Failed to create room.');
      setLogs(prev => [createLogEntry('Room create failed', 'error', createError?.message), ...prev.slice(0, 49)]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveRoom = async () => {
    if (!selectedRoom) {
      return;
    }
    setStatusMessage('');
    setError('');
    setIsLoading(true);
    try {
      await patchRoom(selectedRoom.roomId, {
        name: roomName,
        description: roomDescription,
        slideSequence: roomSlideSequence,
      } as Partial<RoomConfiguration>);
      setStatusMessage(`Saved room "${selectedRoom.roomId}".`);
      setLogs(prev => [createLogEntry('Room updated', 'success', selectedRoom.roomId), ...prev.slice(0, 49)]);
      await refreshAdminData({ roomId: selectedRoom.roomId });
      await notifyLiveContentChanged();
    } catch (saveError: any) {
      setError(saveError?.message || 'Failed to save room.');
      setLogs(prev => [createLogEntry('Room save failed', 'error', saveError?.message), ...prev.slice(0, 49)]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReorderRoomSequence = async () => {
    if (!selectedRoom) {
      return;
    }
    setStatusMessage('');
    setError('');
    setIsLoading(true);
    try {
      await reorderRoomSlides(selectedRoom.roomId, roomSlideSequence);
      setStatusMessage(`Updated slide order for "${selectedRoom.roomId}".`);
      await refreshAdminData({ roomId: selectedRoom.roomId });
      await notifyLiveContentChanged();
    } catch (reorderError: any) {
      setError(reorderError?.message || 'Failed to update room slide order.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSlide = async () => {
    if (!selectedSlide) return;
    setDeleteSlideConfirm(false);
    setStatusMessage('');
    setError('');
    setIsDeletingSlide(true);
    try {
      await deleteSlide(selectedSlide.id);
      setStatusMessage(`Deleted slide "${selectedSlide.id}".`);
      setLogs(prev => [createLogEntry('Slide deleted', 'success', selectedSlide.id), ...prev.slice(0, 49)]);
      setSelectedSlideId('');
      clearSlideForm();
      await refreshAdminData();
      await notifyLiveContentChanged();
    } catch (deleteError: any) {
      setError(deleteError?.message || 'Failed to delete slide.');
      setLogs(prev => [createLogEntry('Slide delete failed', 'error', deleteError?.message), ...prev.slice(0, 49)]);
    } finally {
      setIsDeletingSlide(false);
    }
  };

  const handleDeleteRoom = async () => {
    if (!selectedRoom) return;
    setDeleteRoomConfirm(false);
    setStatusMessage('');
    setError('');
    setIsDeletingRoom(true);
    try {
      await deleteRoom(selectedRoom.roomId);
      setStatusMessage(`Deleted room "${selectedRoom.roomId}".`);
      setLogs(prev => [createLogEntry('Room deleted', 'success', selectedRoom.roomId), ...prev.slice(0, 49)]);
      setSelectedRoomId('');
      await refreshAdminData();
      await notifyLiveContentChanged();
    } catch (deleteError: any) {
      setError(deleteError?.message || 'Failed to delete room.');
      setLogs(prev => [createLogEntry('Room delete failed', 'error', deleteError?.message), ...prev.slice(0, 49)]);
    } finally {
      setIsDeletingRoom(false);
    }
  };

  const handlePublish = async () => {
    setStatusMessage('');
    setError('');
    setIsLoading(true);
    try {
      const result = await publishContent();
      const details = result.publishInfo;
      setStatusMessage(
        `${result.message} Version ${details.publishedVersion} at ${details.publishedAt}.`
      );
      setLogs((prev) => [
        createLogEntry(
          'Content published',
          'success',
          `v${details.publishedVersion} -> ${details.targetContainer || 'bluecrow-content-prod'}`
        ),
        ...prev.slice(0, 49),
      ]);
      await refreshAdminData();
    } catch (publishError: any) {
      setError(publishError?.message || 'Failed to publish content.');
      setLogs((prev) => [
        createLogEntry('Publish failed', 'error', publishError?.message),
        ...prev.slice(0, 49),
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleIndexerRefresh = async () => {
    setStatusMessage('');
    setError('');
    setIsLoading(true);
    try {
      setStatusMessage(await triggerIndexerRefresh());
    } catch (indexerError: any) {
      setError(indexerError?.message || 'Failed to trigger indexer refresh.');
    } finally {
      setIsLoading(false);
    }
  };

  const validateMediaFile = (
    file: File,
    mediaType: 'images' | 'videos'
  ): string | null => {
    const normalizedType = file.type.toLowerCase();
    const maxBytes =
      mediaType === 'images' ? MAX_IMAGE_UPLOAD_BYTES : MAX_VIDEO_UPLOAD_BYTES;
    const allowedTypes =
      mediaType === 'images' ? ALLOWED_IMAGE_TYPES : ALLOWED_VIDEO_TYPES;
    const allowedLabel =
      mediaType === 'images' ? 'PNG, JPG or WEBP' : 'MP4 or WEBM';

    if (!normalizedType || !allowedTypes.has(normalizedType)) {
      return `Unsupported file type. Use ${allowedLabel}.`;
    }
    if (file.size > maxBytes) {
      return `File too large. ${mediaType === 'images' ? 'Images' : 'Videos'} must be under ${formatMegabytes(maxBytes)}.`;
    }
    return null;
  };

  const handleSlideMediaFileChange = (
    field: SlideMediaField,
    file: File | null
  ) => {
    if (!file) {
      if (field === 'image') {
        setSlideImageFile(null);
        setSlideImageUploadProgress(0);
      } else {
        setSlideVideoFile(null);
        setSlideVideoUploadProgress(0);
      }
      return;
    }

    const mediaType = field === 'image' ? 'images' : 'videos';
    const validationError = validateMediaFile(file, mediaType);
    if (validationError) {
      setError(validationError);
      if (field === 'image') {
        setSlideImageFile(null);
        setSlideImageUploadProgress(0);
      } else {
        setSlideVideoFile(null);
        setSlideVideoUploadProgress(0);
      }
      return;
    }

    setError('');
    if (field === 'image') {
      setSlideImageFile(file);
      setSlideImageUploadProgress(0);
    } else {
      setSlideVideoFile(file);
      setSlideVideoUploadProgress(0);
    }
  };

  const handleSlideFieldUpload = async (field: SlideMediaField) => {
    if (isSlideMediaUploading) {
      setError('A media upload is already in progress.');
      return;
    }

    const file = field === 'image' ? slideImageFile : slideVideoFile;
    const mediaType = field === 'image' ? 'images' : 'videos';
    const setUploading =
      field === 'image' ? setIsSlideImageUploading : setIsSlideVideoUploading;
    const setProgress =
      field === 'image'
        ? setSlideImageUploadProgress
        : setSlideVideoUploadProgress;
    const label = field === 'image' ? 'Image' : 'Video';

    if (!file) {
      setError(`Choose a ${field} file before uploading.`);
      return;
    }

    const validationError = validateMediaFile(file, mediaType);
    if (validationError) {
      setError(validationError);
      return;
    }

    const slideId = slideIdInput.trim();
    if (!slideId) {
      setError('Slide ID is required before uploading media.');
      return;
    }

    const category = slideCategory.trim();
    if (!category) {
      setError('Slide category is required before uploading media.');
      return;
    }

    setStatusMessage('');
    setError('');
    setProgress(5);
    setUploading(true);

    try {
      const signedUpload = await requestUploadUrl({
        fileName: file.name,
        contentType: file.type,
        mediaType,
        slideId,
        category,
        uploadContext: 'slide',
      });

      setProgress(15);
      const base64Data = await fileToBase64(file);
      setProgress(25);

      const result = await uploadSignedMedia({
        uploadUrl: signedUpload.uploadUrl,
        token: signedUpload.token,
        base64Data,
        contentType: file.type,
        onProgress: (progress) => {
          const mappedProgress = Math.min(
            99,
            25 + Math.round((progress * 74) / 100)
          );
          setProgress(mappedProgress);
        },
      });

      if (field === 'image') {
        setSlideImageUrl(result.assetUrl);
        setSlideImageFile(null);
      } else {
        setSlideVideoUrl(result.assetUrl);
        setSlideVideoFile(null);
      }

      setProgress(100);
      setStatusMessage(`${label} upload complete.`);
      setLogs((prev) => [
        createLogEntry(
          'Slide media uploaded',
          'success',
          `${slideId} (${field}): ${file.name}`
        ),
        ...prev.slice(0, 49),
      ]);
    } catch (uploadError: any) {
      setProgress(0);
      setError(uploadError?.message || `Failed to upload ${field}.`);
      setLogs((prev) => [
        createLogEntry(
          'Slide media upload failed',
          'error',
          uploadError?.message
        ),
        ...prev.slice(0, 49),
      ]);
    } finally {
      setUploading(false);
    }
  };

  const validateKnowledgeBaseFile = (file: File): string | null => {
    const extension = getFileExtension(file.name);
    const normalizedType = file.type.trim().toLowerCase();
    if (!KNOWLEDGE_BASE_ALLOWED_EXTENSIONS.has(extension)) {
      return 'Unsupported file type. Use PDF, DOCX, PPT, or PPTX.';
    }
    if (normalizedType && !KNOWLEDGE_BASE_ALLOWED_TYPES.has(normalizedType)) {
      return 'Unsupported file type. Use PDF, DOCX, PPT, or PPTX.';
    }
    if (file.size > KNOWLEDGE_BASE_MAX_UPLOAD_BYTES) {
      return `File too large. Maximum size is ${formatMegabytes(
        KNOWLEDGE_BASE_MAX_UPLOAD_BYTES
      )}.`;
    }
    return null;
  };

  const handleKnowledgeBaseFileChange = (file: File | null) => {
    if (!file) {
      setKnowledgeBaseUploadFile(null);
      setKnowledgeBaseUploadProgress(0);
      return;
    }
    const validationError = validateKnowledgeBaseFile(file);
    if (validationError) {
      setError(validationError);
      setKnowledgeBaseUploadFile(null);
      setKnowledgeBaseUploadProgress(0);
      return;
    }
    setError('');
    setKnowledgeBaseUploadFile(file);
    setKnowledgeBaseUploadProgress(0);
  };

  const handleKnowledgeBaseUpload = async () => {
    if (isKnowledgeBaseUploading) {
      return;
    }

    if (!knowledgeBaseUploadFile) {
      setError('Choose a document before uploading.');
      return;
    }

    const validationError = validateKnowledgeBaseFile(knowledgeBaseUploadFile);
    if (validationError) {
      setError(validationError);
      return;
    }

    const description = knowledgeBaseUploadDescription.trim();
    if (!description) {
      setError('Description is required.');
      return;
    }

    setStatusMessage('');
    setError('');
    setKnowledgeBaseUploadProgress(5);
    setIsKnowledgeBaseUploading(true);

    try {
      const base64Data = await fileToBase64(knowledgeBaseUploadFile);
      setKnowledgeBaseUploadProgress(15);

      await uploadKnowledgeBaseDocument({
        fileName: knowledgeBaseUploadFile.name,
        contentType:
          knowledgeBaseUploadFile.type || 'application/octet-stream',
        base64Data,
        description,
        tag: knowledgeBaseUploadTag,
        onProgress: (progress) => {
          const mapped = Math.min(99, 15 + Math.round((progress * 84) / 100));
          setKnowledgeBaseUploadProgress(mapped);
        },
      });

      setKnowledgeBaseUploadProgress(100);
      setKnowledgeBaseUploadFile(null);
      setKnowledgeBaseUploadDescription('');
      setStatusMessage('Knowledge base document uploaded.');
      setLogs((prev) => [
        createLogEntry(
          'Knowledge base document uploaded',
          'success',
          `${knowledgeBaseUploadTag}: ${knowledgeBaseUploadFile.name}`
        ),
        ...prev.slice(0, 49),
      ]);
      await refreshKnowledgeBaseDocuments({ silent: true });
    } catch (uploadError: any) {
      setKnowledgeBaseUploadProgress(0);
      setError(uploadError?.message || 'Failed to upload document.');
      setLogs((prev) => [
        createLogEntry(
          'Knowledge base upload failed',
          'error',
          uploadError?.message
        ),
        ...prev.slice(0, 49),
      ]);
    } finally {
      setIsKnowledgeBaseUploading(false);
    }
  };

  const moveSequenceItem = (index: number, direction: -1 | 1) => {
    setRoomSlideSequence((previous) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= previous.length) {
        return previous;
      }
      const next = [...previous];
      const temp = next[index];
      next[index] = next[nextIndex];
      next[nextIndex] = temp;
      return next;
    });
  };

  const addSlideToRoomSequence = (slideId: string) => {
    setRoomSlideSequence((previous) => {
      if (previous.includes(slideId)) {
        return previous;
      }
      return [...previous, slideId];
    });
    setSelectedRoomSlideId(slideId);
  };

  const requestKnowledgeBaseDelete = (document: KnowledgeBaseDocument) => {
    setKnowledgeBaseDeleteTarget(document);
  };

  const confirmKnowledgeBaseDelete = async () => {
    if (!knowledgeBaseDeleteTarget || isKnowledgeBaseDeleting) {
      return;
    }

    setError('');
    setStatusMessage('');
    setIsKnowledgeBaseDeleting(true);

    try {
      await deleteKnowledgeBaseDocument(knowledgeBaseDeleteTarget.id);
      setKnowledgeBaseDocuments((previous) =>
        previous.filter((document) => document.id !== knowledgeBaseDeleteTarget.id)
      );
      setStatusMessage('Knowledge base document deleted.');
      setLogs((prev) => [
        createLogEntry(
          'Knowledge base document deleted',
          'success',
          knowledgeBaseDeleteTarget.fileName
        ),
        ...prev.slice(0, 49),
      ]);
      setKnowledgeBaseDeleteTarget(null);
    } catch (deleteError: any) {
      setError(deleteError?.message || 'Failed to delete document.');
      setLogs((prev) => [
        createLogEntry(
          'Knowledge base delete failed',
          'error',
          deleteError?.message
        ),
        ...prev.slice(0, 49),
      ]);
    } finally {
      setIsKnowledgeBaseDeleting(false);
    }
  };

  const inputClass = isDark
    ? 'w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500/60 transition-colors'
    : 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500/60 transition-colors';

  const disabledInputClass = isDark
    ? 'w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-500 cursor-not-allowed'
    : 'w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-400 cursor-not-allowed';
  const isSlideFormBusy = isLoading || isSlideMediaUploading;

  return (
    <div className={`fixed inset-0 z-[120] flex flex-col ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'}`}>
      <style>{scrollbarStyles}</style>
      {/* Header */}
      <header className={`shrink-0 border-b backdrop-blur-sm px-6 py-4 ${isDark ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-white/80'}`}>
        <div className="mx-auto max-w-[1450px] flex flex-col gap-3">
          {/* Top row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img src={isDark ? '/icon_BCC_white.png' : '/icon_BCC.png'} alt="Blue Crow Capital" className="w-7 h-7 opacity-90" />
              <div>
                <h2 className="text-lg font-semibold leading-tight">Admin Console</h2>

              </div>


              {/* logs option*/}
              {/* <button
                onClick={() => setShowLogs(!showLogs)}
                className="ml-4 px-2 py-1 text-xs rounded border border-slate-600 bg-slate-800/50 text-slate-300 hover:bg-slate-700 transition-colors flex items-center gap-1"
              >
                <span>Logs</span>
                {logs.length > 0 && <span className="ml-1 text-xs font-semibold">{logs.length}</span>}
              </button> */}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { const next = !isDark; setIsDark(next); try { localStorage.setItem('adminTheme', next ? 'dark' : 'light'); } catch { /* ignore */ } }}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors"
                aria-label="Toggle theme"
              >
                {isDark ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
              </button>
              <button
                onClick={onClose}
                className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors"
              >
                <ArrowLeftIcon className="w-4 h-4" />
                Back to Lobby
              </button>
            </div>
          </div>

          {/* Stats row
          {isAuthenticated && adminContent && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  label: 'Live Slides',
                  value: adminContent.summary.slideCount,
                  icon: (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-blue-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                    </svg>
                  ),
                },
                {
                  label: 'Live Rooms',
                  value: adminContent.summary.roomCount,
                  icon: (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-purple-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                    </svg>
                  ),
                },
                {
                  label: 'Content Version',
                  value: adminContent.summary.version,
                  icon: (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-emerald-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ),
                },
                {
                  label: 'Last Updated',
                  value: adminContent.summary.updatedAt,
                  icon: (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-amber-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ),
                },
              ].map(({ label, value, icon }) => (
                <div key={label} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${isDark ? 'border-slate-700/60 bg-slate-800/50' : 'border-slate-200 bg-white'}`}>
                  {icon}
                  <div className="min-w-0">
                    <p className={`text-[10px] uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{label}</p>
                    <p className={`truncate text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{value}</p>
                  </div>
                </div>
              ))}
            </div>
          )*/}
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="mx-auto flex h-full max-w-[1450px] flex-col px-6 py-4">

          {/* Auth warning */}
          {!isAuthenticated && (
            <div className={`mb-4 rounded-xl border p-4 ${isDark ? 'border-amber-500/30 bg-amber-500/10' : 'border-amber-600/40 bg-amber-100'}`}>
              <div className="flex items-start gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 mt-0.5 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <div>
                  <p className={`text-sm font-medium ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>Authentication required</p>
                  <p className={`text-sm mt-0.5 ${isDark ? 'text-amber-200/70' : 'text-amber-800'}`}>Sign in with your Microsoft Entra account to access admin features.</p>
                  {isLocalHost && (
                    <p className={`mt-2 text-xs ${isDark ? 'text-amber-200/60' : 'text-amber-700'}`}>
                      Local dev: run <code className={`font-mono px-1 rounded ${isDark ? 'bg-amber-500/10' : 'bg-amber-200'}`}>swa start http://localhost:3000 --api-location api</code>
                    </p>
                  )}
                  <a
                    href={isForbidden ? logoutThenLoginUrl : loginUrl}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                    </svg>
                    {isForbidden ? 'Sign In With a Different Account' : 'Sign In With Microsoft'}
                  </a>
                  {isForbidden && (
                    <div className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${isDark ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-red-300 bg-red-50 text-red-700'}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mt-0.5 shrink-0">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                      <span>The account you used does not have permission. Please sign in with an authorized account.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className={`mb-3 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${isDark ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-red-300 bg-red-100 text-red-700'}`}>
              <div className="flex items-start gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mt-0.5 shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <span>{error}</span>
              </div>
              <button onClick={() => setError('')} className={`shrink-0 transition-colors ${isDark ? 'text-red-400/60 hover:text-red-300' : 'text-red-600/60 hover:text-red-700'}`}>
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Status banner */}
          {statusMessage && (
            <div className={`mb-3 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${isDark ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-emerald-300 bg-emerald-100 text-emerald-700'}`}>
              <div className="flex items-start gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mt-0.5 shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{statusMessage}</span>
              </div>
              <button onClick={() => setStatusMessage('')} className={`shrink-0 transition-colors ${isDark ? 'text-emerald-400/60 hover:text-emerald-300' : 'text-emerald-600/60 hover:text-emerald-700'}`}>
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
          )}

          {isAuthenticated && adminContent && (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* Tab bar */}
              <div className={`mb-3 flex gap-1 rounded-xl border p-1 ${isDark ? 'border-slate-700/60 bg-slate-800/40' : 'border-slate-200 bg-slate-200/60'}`}>
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${
                      activeTab === tab.key
                        ? 'bg-blue-600 text-white shadow-sm'
                        : isDark
                          ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                          : 'text-slate-500 hover:text-slate-800 hover:bg-white/70'
                    }`}
                  >
                    {tab.icon}
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className={`relative min-h-0 flex-1 overflow-hidden rounded-xl border ${isDark ? 'border-slate-700/60 bg-slate-900/50' : 'border-slate-200 bg-white'}`}>
                {/* Loading overlay */}
                {isLoading && (
                  <div className={`absolute inset-0 z-10 flex items-center justify-center rounded-xl backdrop-blur-sm ${isDark ? 'bg-slate-950/60' : 'bg-white/60'}`}>
                    <div className={`flex items-center gap-3 rounded-xl border px-5 py-3 text-sm ${isDark ? 'border-slate-700 bg-slate-800/80 text-slate-300' : 'border-slate-200 bg-white text-slate-600'}`}>
                      <Spinner />
                      <span>Working...</span>
                    </div>
                  </div>
                )}

                {/* Slides tab */}
                {activeTab === 'slides' && (
                  <div className="grid h-full gap-0 lg:grid-cols-[300px_minmax(0,1fr)]">
                    {/* Sidebar */}
                    <aside className={`flex flex-col min-h-0 overflow-hidden border-r p-3 ${isDark ? 'border-slate-700/60 bg-slate-950/40' : 'border-slate-200 bg-slate-50'}`}>
                      <button
                        onClick={beginCreateSlide}
                        className="mb-2 flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        New Slide
                      </button>

                      <p className="mb-1.5 px-1 text-[11px] text-slate-500 uppercase tracking-wide">Categories</p>
                      <div className="mb-2 max-h-44 overflow-y-auto space-y-1 pr-0.5 custom-scrollbar">
                        <button
                          onClick={() => setActiveSlideCategoryFilter(ALL_SLIDE_CATEGORIES)}
                          className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
                            activeSlideCategoryFilter === ALL_SLIDE_CATEGORIES
                              ? 'border-blue-500/60 bg-blue-500/10'
                              : isDark ? 'border-slate-700/60 bg-slate-800/30 hover:bg-slate-700/40 hover:border-slate-600' : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`truncate text-xs font-medium ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>All categories</span>
                            <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${isDark ? 'border-slate-600 bg-slate-800 text-slate-300' : 'border-slate-300 bg-slate-200 text-slate-800'}`}>
                              {sortedSlides.length}
                            </span>
                          </div>
                        </button>
                        {slideCategoryOptions.map((category) => (
                          <button
                            key={category.name}
                            onClick={() => setActiveSlideCategoryFilter(category.name)}
                            className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
                              activeSlideCategoryFilter === category.name
                                ? 'border-blue-500/60 bg-blue-500/10'
                                : isDark ? 'border-slate-700/60 bg-slate-800/30 hover:bg-slate-700/40 hover:border-slate-600' : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className={`truncate text-xs font-medium ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{category.name}</span>
                              <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${isDark ? 'border-slate-600 bg-slate-800 text-slate-300' : 'border-slate-300 bg-slate-200 text-slate-800'}`}>
                                {category.count}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>

                      <div className="relative mb-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                        </svg>
                        <input
                          value={slideSearch}
                          onChange={(event) => setSlideSearch(event.target.value)}
                          placeholder={
                            activeSlideCategoryFilter === ALL_SLIDE_CATEGORIES
                              ? 'Search all slides...'
                              : `Search ${activeSlideCategoryFilter}...`
                          }
                          className={`w-full rounded-lg border py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 ${isDark ? 'border-slate-600 bg-slate-900 text-slate-100 placeholder-slate-500' : 'border-slate-300 bg-white text-slate-900 placeholder-slate-400'}`}
                        />
                      </div>

                      <p className="mb-1.5 px-1 text-[11px] text-slate-500">
                        {filteredSlides.length} of {activeCategorySlideCount} slide{activeCategorySlideCount !== 1 ? 's' : ''}{' '}
                        {activeSlideCategoryFilter === ALL_SLIDE_CATEGORIES ? 'in all categories' : `in ${activeSlideCategoryFilter}`}
                      </p>

                      <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 custom-scrollbar">
                        {filteredSlides.map((slide) => {
                          const slideCategoryLabel =
                            slideCategoryById.get(slide.id) ||
                            UNCATEGORIZED_SLIDE_CATEGORY;
                          return (
                            <button
                              key={slide.id}
                              onClick={() => {
                                setIsCreatingSlide(false);
                                setSelectedSlideId(slide.id);
                              }}
                              className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                                !isCreatingSlide && selectedSlideId === slide.id
                                  ? 'border-blue-500/60 bg-blue-500/10'
                                  : isDark ? 'border-slate-700/60 bg-slate-800/30 hover:bg-slate-700/40 hover:border-slate-600' : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className={`truncate text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{slide.id}</p>
                                {slide.QnA && (
                                  <span className="shrink-0 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-400">Q&A</span>
                                )}
                              </div>
                              <p className={`mt-0.5 truncate text-xs ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>{slide.title}</p>
                              <p className="mt-0.5 truncate text-[11px] text-slate-500">{slideCategoryLabel}</p>
                            </button>
                          );
                        })}
                        {filteredSlides.length === 0 && (
                          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-slate-700 text-xs text-slate-500">
                            No slides match this category/filter
                          </div>
                        )}
                      </div>
                    </aside>

                    {/* Editor */}
                    <section className="min-h-0 overflow-y-auto custom-scrollbar p-4">
                      {/* Section title */}
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-200">
                            {isCreatingSlide ? 'New Slide' : selectedSlideId ? `Editing: ${selectedSlideId}` : 'Select a slide'}
                          </h3>
                          {!isCreatingSlide && selectedSlideId && (
                            <p className="text-xs text-slate-500 mt-0.5">Make changes and save to update live content.</p>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-3">
                        <div>
                          <FieldLabel required>Slide ID</FieldLabel>
                          <input
                            value={slideIdInput}
                            onChange={(event) => setSlideIdInput(event.target.value)}
                            placeholder="e.g. agro_intro"
                            disabled={isSlideFormBusy}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <FieldLabel required>Title</FieldLabel>
                          <input
                            value={slideTitle}
                            onChange={(event) => setSlideTitle(event.target.value)}
                            placeholder="Slide title"
                            disabled={isSlideFormBusy}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <FieldLabel required>Category</FieldLabel>
                          <input
                            value={slideCategory}
                            onChange={(event) => setSlideCategory(event.target.value)}
                            placeholder="e.g. NextTech-Fund"
                            disabled={isSlideFormBusy}
                            className={inputClass}
                          />
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div>
                          <div className={`rounded-lg border p-3 ${isDark ? 'border-slate-700/60 bg-slate-800/30' : 'border-slate-200 bg-slate-50'}`}>
                            <FieldLabel required>Image Asset</FieldLabel>
                            <div className="flex items-center gap-2">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(event) =>
                                  handleSlideMediaFileChange(
                                    'image',
                                    event.target.files?.[0] || null
                                  )
                                }
                                disabled={isSlideFormBusy}
                                className={`${inputClass} file:mr-3 file:rounded-md file:border-0 ${isDark ? 'file:bg-slate-700 file:text-slate-100 hover:file:bg-slate-600' : 'file:bg-slate-200 file:text-slate-700 hover:file:bg-slate-300'} file:px-2.5 file:py-1.5 file:text-xs file:font-medium`}
                              />
                              <button
                                onClick={() => handleSlideFieldUpload('image')}
                                disabled={!slideImageFile || isSlideFormBusy}
                                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium hover:bg-blue-500 disabled:opacity-50 transition-colors"
                              >
                                {isSlideImageUploading ? <Spinner /> : null}
                                {isSlideImageUploading ? 'Uploading...' : 'Upload'}
                              </button>
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500">
                              PNG, JPG, WEBP up to {formatMegabytes(MAX_IMAGE_UPLOAD_BYTES)}.
                            </p>
                            {slideImageFile && (
                              <p className="mt-1 truncate text-xs text-slate-400">{slideImageFile.name}</p>
                            )}
                            {(isSlideImageUploading || slideImageUploadProgress > 0) && (
                              <div className="mt-2">
                                <div className={`h-1.5 w-full overflow-hidden rounded ${isDark ? 'bg-slate-700/70' : 'bg-slate-200'}`}>
                                  <div
                                    className="h-full bg-blue-500 transition-all"
                                    style={{ width: `${slideImageUploadProgress}%` }}
                                  />
                                </div>
                                <p className="mt-1 text-[11px] text-slate-500">
                                  {slideImageUploadProgress}% uploaded
                                </p>
                              </div>
                            )}
                            <div className="mt-3">
                              <FieldLabel required>Image URL</FieldLabel>
                              <input
                                value={slideImageUrl}
                                readOnly
                                placeholder="Uploaded image URL will appear here"
                                className={disabledInputClass}
                              />
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className={`rounded-lg border p-3 ${isDark ? 'border-slate-700/60 bg-slate-800/30' : 'border-slate-200 bg-slate-50'}`}>
                            <FieldLabel>Video Asset</FieldLabel>
                            <div className="flex items-center gap-2">
                              <input
                                type="file"
                                accept="video/*"
                                onChange={(event) =>
                                  handleSlideMediaFileChange(
                                    'video',
                                    event.target.files?.[0] || null
                                  )
                                }
                                disabled={isSlideFormBusy}
                                className={`${inputClass} file:mr-3 file:rounded-md file:border-0 ${isDark ? 'file:bg-slate-700 file:text-slate-100 hover:file:bg-slate-600' : 'file:bg-slate-200 file:text-slate-700 hover:file:bg-slate-300'} file:px-2.5 file:py-1.5 file:text-xs file:font-medium`}
                              />
                              <button
                                onClick={() => handleSlideFieldUpload('video')}
                                disabled={!slideVideoFile || isSlideFormBusy}
                                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium hover:bg-blue-500 disabled:opacity-50 transition-colors"
                              >
                                {isSlideVideoUploading ? <Spinner /> : null}
                                {isSlideVideoUploading ? 'Uploading...' : 'Upload'}
                              </button>
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500">
                              MP4, WEBM up to {formatMegabytes(MAX_VIDEO_UPLOAD_BYTES)}.
                            </p>
                            {slideVideoFile && (
                              <p className="mt-1 truncate text-xs text-slate-400">{slideVideoFile.name}</p>
                            )}
                            {(isSlideVideoUploading || slideVideoUploadProgress > 0) && (
                              <div className="mt-2">
                                <div className={`h-1.5 w-full overflow-hidden rounded ${isDark ? 'bg-slate-700/70' : 'bg-slate-200'}`}>
                                  <div
                                    className="h-full bg-blue-500 transition-all"
                                    style={{ width: `${slideVideoUploadProgress}%` }}
                                  />
                                </div>
                                <p className="mt-1 text-[11px] text-slate-500">
                                  {slideVideoUploadProgress}% uploaded
                                </p>
                              </div>
                            )}
                            <div className="mt-3">
                              <FieldLabel>Video URL</FieldLabel>
                              <input
                                value={slideVideoUrl}
                                readOnly
                                placeholder="Uploaded video URL will appear here"
                                className={disabledInputClass}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <FieldLabel required>Description</FieldLabel>
                        <textarea
                          value={slideDescription}
                          onChange={(event) => setSlideDescription(event.target.value)}
                          placeholder="Brief description of this slide's content"
                          className={`${inputClass} h-20 resize-none`}
                        />
                      </div>

                      <label className={`mt-3 inline-flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors select-none ${isDark ? 'border-slate-700/60 bg-slate-800/40 text-slate-300 hover:bg-slate-700/40' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
                        <input
                          type="checkbox"
                          checked={slideQnA}
                          onChange={(event) => setSlideQnA(event.target.checked)}
                          className="rounded accent-blue-500"
                        />
                        Include in Q&amp;A knowledge base
                      </label>

                      {/* Script fields */}
                      <div className="mt-4">
                        <FieldLabel>Pitch Scripts</FieldLabel>
                        <div className="grid gap-3 lg:grid-cols-2">
                          {SCRIPT_FIELDS.map((field) => (
                            <div key={field.key}>
                              <div className="mb-1.5 flex gap-1.5">
                                {(field.badges ?? [{ label: field.label, darkColor: field.darkColor, lightColor: field.lightColor }]).map((badge) => (
                                  <span key={badge.label} className={`inline-block rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${isDark ? badge.darkColor : badge.lightColor}`}>
                                    {badge.label}
                                  </span>
                                ))}
                              </div>
                              <textarea
                                value={field.key === 'en' ? slideScriptEn : slideScriptPtBr}
                                onChange={(event) => {
                                  if (field.key === 'en') setSlideScriptEn(event.target.value);
                                  else setSlideScriptPtBr(event.target.value);
                                }}
                                placeholder={`Script for ${field.label}`}
                                className={`${inputClass} h-32 resize-none`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Media previews */}
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className={`rounded-lg border p-3 ${isDark ? 'border-slate-700/60 bg-slate-800/30' : 'border-slate-200 bg-slate-50'}`}>
                          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">Image Preview</p>
                          {slideImageUrl ? (
                            <img
                              src={toMediaUrl(slideImageUrl)}
                              alt="slide preview"
                              className="h-44 w-full rounded-lg bg-slate-950 object-contain"
                            />
                          ) : (
                            <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-slate-700 text-xs text-slate-600">
                              No image URL set
                            </div>
                          )}
                        </div>
                        <div className={`rounded-lg border p-3 ${isDark ? 'border-slate-700/60 bg-slate-800/30' : 'border-slate-200 bg-slate-50'}`}>
                          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">Video Preview</p>
                          {slideVideoUrl ? (
                            <div className="flex h-44 flex-col gap-2 rounded-lg border border-slate-700 bg-slate-950/50 p-2">
                              <video
                                src={toMediaUrl(slideVideoUrl)}
                                controls
                                preload="metadata"
                                className="h-full w-full rounded-lg bg-slate-950 object-contain"
                              />
                              <p className="w-full truncate text-xs text-slate-300">{getMediaFileName(slideVideoUrl)}</p>
                            </div>
                          ) : (
                            <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-slate-700 text-xs text-slate-600">
                              No video URL set
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={handleSaveSlide}
                          disabled={isLoading || isSlideMediaUploading || isDeletingSlide}
                          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                        >
                          {isLoading ? <Spinner /> : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          )}
                          {isCreatingSlide ? 'Create Slide' : 'Save Slide'}
                        </button>
                        <button
                          onClick={clearSlideForm}
                          disabled={isSlideMediaUploading || isDeletingSlide}
                          className="rounded-lg border border-slate-500 bg-slate-600 px-4 py-2 text-sm text-white hover:bg-slate-700 transition-colors"
                        >
                          Clear
                        </button>
                        {!isCreatingSlide && selectedSlide && (
                          <button
                            onClick={() => setDeleteSlideConfirm(true)}
                            disabled={isLoading || isSlideMediaUploading || isDeletingSlide}
                            className="ml-auto flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
                          >
                            {isDeletingSlide ? <Spinner /> : null }
                            Delete Slide
                          </button>
                        )}
                      </div>
                    </section>
                  </div>
                )}

                {/* Rooms tab */}
                {activeTab === 'rooms' && (
                  <div className="grid h-full gap-0 lg:grid-cols-[300px_minmax(0,1fr)]">
                    {/* Sidebar */}
                    <aside className={`flex flex-col min-h-0 overflow-hidden border-r p-3 ${isDark ? 'border-slate-700/60 bg-slate-950/40' : 'border-slate-200 bg-slate-50'}`}>
                      <button
                        onClick={beginCreateRoom}
                        className="mb-2 flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        New Room
                      </button>
                      <div className="relative mb-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                        </svg>
                        <input
                          value={roomSearch}
                          onChange={(event) => setRoomSearch(event.target.value)}
                          placeholder="Search rooms..."
                          className={`w-full rounded-lg border py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 ${isDark ? 'border-slate-600 bg-slate-900 text-slate-100 placeholder-slate-500' : 'border-slate-300 bg-white text-slate-900 placeholder-slate-400'}`}
                        />
                      </div>
                      <p className="mb-1.5 px-1 text-[11px] text-slate-500">
                        {filteredRooms.length} room{filteredRooms.length !== 1 ? 's' : ''}
                      </p>
                      <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 custom-scrollbar">
                        {filteredRooms.map((room) => (
                          <button
                            key={room.roomId}
                            onClick={() => { setIsCreatingRoom(false); setSelectedRoomId(room.roomId); }}
                            className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                              !isCreatingRoom && selectedRoomId === room.roomId
                                ? 'border-blue-500/60 bg-blue-500/10'
                                : isDark ? 'border-slate-700/60 bg-slate-800/30 hover:bg-slate-700/40 hover:border-slate-600' : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300'
                            }`}
                          >
                            <p className={`truncate text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{room.roomId}</p>
                            <p className="mt-0.5 truncate text-xs text-slate-400">{room.name}</p>
                            <p className="mt-0.5 text-[10px] text-slate-600">{room.slideSequence?.length || 0} slides</p>
                          </button>
                        ))}
                      </div>
                    </aside>

                    {/* Room editor */}
                    <section className="min-h-0 overflow-y-auto custom-scrollbar p-4">
                      {isCreatingRoom ? (
                        <>
                          <div className="mb-4">
                            <h3 className="text-sm font-semibold text-slate-200">New Room</h3>
                            <p className="text-xs text-slate-500 mt-0.5">Fill in the details to create a new room.</p>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <FieldLabel>Room ID</FieldLabel>
                              <input
                                value={newRoomId}
                                onChange={(e) => setNewRoomId(e.target.value.toUpperCase())}
                                placeholder="e.g. BC-INT-A50-OPE"
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <FieldLabel>Room Name</FieldLabel>
                              <input
                                value={roomName}
                                onChange={(e) => setRoomName(e.target.value)}
                                placeholder="Display name"
                                className={inputClass}
                              />
                            </div>
                          </div>

                          <div className="mt-4">
                            <FieldLabel>Description</FieldLabel>
                            <textarea
                              value={roomDescription}
                              onChange={(e) => setRoomDescription(e.target.value)}
                              placeholder="Room description"
                              className={`${inputClass} h-20 resize-none`}
                            />
                          </div>

                          <div className="mt-4 flex gap-2">
                            <button
                              onClick={handleCreateRoom}
                              disabled={isLoading}
                              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50"
                            >
                              Create Room
                            </button>
                            <button
                              onClick={() => setIsCreatingRoom(false)}
                              disabled={isLoading}
                              className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : !selectedRoom ? (
                        <div className="flex h-full items-center justify-center">
                          <p className="text-sm text-slate-500">Select a room from the list to edit it.</p>
                        </div>
                      ) : (
                        <>
                          <div className="mb-4 flex items-center justify-between">
                            <p className="text-sm text-slate-700">Update room details and manage its slide sequence.</p>
                            <div className="flex gap-2">
                              <button
                                onClick={handleSaveRoom}
                                disabled={isLoading || isDeletingRoom}
                                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                              >
                                {isLoading ? <Spinner /> : null}
                                Save Room
                              </button>
                              <button
                                onClick={() => setDeleteRoomConfirm(true)}
                                disabled={isLoading || isDeletingRoom}
                                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
                              >
                                {isDeletingRoom ? <Spinner /> : null}
                                Delete Room
                              </button>
                            </div>
                          </div>

                          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_550px]">
                            <div className="flex flex-col gap-4">
                              <div>
                                <FieldLabel>Room ID</FieldLabel>
                                <input value={selectedRoom.roomId} disabled className={disabledInputClass} />
                              </div>
                              <div>
                                <FieldLabel>Room Name</FieldLabel>
                                <input
                                  value={roomName}
                                  onChange={(event) => setRoomName(event.target.value)}
                                  placeholder="Display name"
                                  className={inputClass}
                                />
                              </div>
                            </div>
                            <div className="flex flex-col">
                              <FieldLabel>Description</FieldLabel>
                              <textarea
                                value={roomDescription}
                                onChange={(event) => setRoomDescription(event.target.value)}
                                placeholder="Room description"
                                className={`${inputClass} flex-1 resize-none`}
                              />
                            </div>
                          </div>
                          <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_550px]">
                            {/* Sequence manager */}
                            <div className={`rounded-xl border p-4 ${isDark ? 'border-slate-700/60 bg-slate-800/30' : 'border-slate-200 bg-slate-50'}`}>
                              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">Slide Sequence</p>
                              <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
                                {roomSlideSequence.map((slideId, index) => {
                                  const slide = slideMap.get(slideId);
                                  return (
                                    <div
                                      key={`${slideId}-${index}`}
                                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                                        selectedRoomSlideId === slideId
                                          ? 'border-blue-500/40 bg-blue-500/10'
                                          : isDark ? 'border-slate-700/60 bg-slate-900/50' : 'border-slate-200 bg-white'
                                      }`}
                                    >
                                      <span className={`shrink-0 w-6 text-center text-[11px] font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                        {index + 1}
                                      </span>
                                      <button
                                        onClick={() => setSelectedRoomSlideId(slideId)}
                                        className="min-w-0 flex-1 text-left"
                                      >
                                        <p className={`truncate text-xs font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{slideId}</p>
                                        <p className="truncate text-[11px] text-slate-500">{slide?.title || 'Unknown slide'}</p>
                                      </button>
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() => moveSequenceItem(index, -1)}
                                          className={`rounded p-1 transition-colors ${isDark ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-800'}`}
                                          title="Move up"
                                        >
                                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                                          </svg>
                                        </button>
                                        <button
                                          onClick={() => moveSequenceItem(index, 1)}
                                          className={`rounded p-1 transition-colors ${isDark ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-800'}`}
                                          title="Move down"
                                        >
                                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                          </svg>
                                        </button>
                                        <button
                                          onClick={() =>
                                            setRoomSlideSequence((previous) => previous.filter((_, i) => i !== index))
                                          }
                                          className="rounded p-1 text-slate-500 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                                          title="Remove from sequence"
                                        >
                                          <CloseIcon className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                                {roomSlideSequence.length === 0 && (
                                  <div className="flex h-24 items-center justify-center text-xs text-slate-600">
                                    No slides in this room's sequence
                                  </div>
                                )}
                              </div>
                              {/* Add slide row */}
                              <div className="mt-3">
                                <SlidePicker
                                  slides={sortedSlides}
                                  excludedSlideIds={roomSlideSequence}
                                  categoryBySlideId={slideCategoryById}
                                  onSelectSlide={addSlideToRoomSequence}
                                  disabled={isLoading}
                                  uncategorizedLabel={UNCATEGORIZED_SLIDE_CATEGORY}
                                  isDark={isDark}
                                />
                              </div>
                            </div>

                            {/* Slide preview */}
                            <div className={`rounded-xl border p-4 ${isDark ? 'border-slate-700/60 bg-slate-800/30' : 'border-slate-200 bg-slate-50'}`}>
                              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">Selected Slide Preview</p>
                              {!selectedRoomSlide ? (
                                <div className="flex h-32 items-center justify-center text-xs text-slate-600">
                                  Click a slide to preview it
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  {selectedRoomSlide.videoUrl ? (
                                    <video src={toMediaUrl(selectedRoomSlide.videoUrl)} controls className={`h-64 w-full rounded-lg ${isDark ? 'bg-slate-950' : 'bg-slate-200'}`} />
                                  ) : null}
                                  <div className="space-y-3">
                                    {SCRIPT_FIELDS.map((field) => (
                                      <div key={field.key} className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                          <div className="flex gap-1.5">
                                            {(field.badges ?? [{ label: field.label, darkColor: field.darkColor, lightColor: field.lightColor }]).map((badge) => (
                                              <span key={badge.label} className={`inline-block rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${isDark ? badge.darkColor : badge.lightColor}`}>
                                                {badge.label}
                                              </span>
                                            ))}
                                          </div>
                                          <div className="flex gap-1">
                                            {editingScriptField === field.key ? (
                                              <>
                                                {/* Save */}
                                                <button
                                                  onClick={async () => {
                                                    const patch = field.key === 'en'
                                                      ? { 'en-US': editingScriptDraft, 'en-UK': editingScriptDraft }
                                                      : { 'pt-BR': editingScriptDraft };
                                                    await patchSlide(selectedRoomSlide.id, {
                                                      pitchScript: { ...selectedRoomSlide.pitchScript, ...patch },
                                                    } as any);
                                                    await refreshAdminData({ slideId: selectedRoomSlide.id });
                                                    await notifyLiveContentChanged();
                                                    setEditingScriptField(null);
                                                  }}
                                                  className="rounded px-2 py-0.5 text-[10px] font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                                                >
                                                  Save
                                                </button>
                                                {/* Cancel */}
                                                <button
                                                  onClick={() => setEditingScriptField(null)}
                                                  className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${isDark ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                                                >
                                                  Cancel
                                                </button>
                                              </>
                                            ) : (
                                              <>
                                                {/* Edit script */}
                                                <button
                                                  onClick={() => {
                                                    const current = field.key === 'en'
                                                      ? selectedRoomSlide.pitchScript['en-US'] || selectedRoomSlide.pitchScript['en-UK']
                                                      : selectedRoomSlide.pitchScript['pt-BR'];
                                                    setEditingScriptDraft(current || '');
                                                    setEditingScriptField(field.key);
                                                  }}
                                                  className={`rounded p-1 transition-colors ${isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'}`}
                                                >
                                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                                  </svg>
                                                </button>
                                                {/* Listen voice agent */}
                                                <button
                                                  onClick={() => {
                                                    const lang = field.key === 'en' ? 'en-US' : 'pt-BR';
                                                    const text = field.key === 'en'
                                                      ? selectedRoomSlide.pitchScript['en-US'] || selectedRoomSlide.pitchScript['en-UK']
                                                      : selectedRoomSlide.pitchScript['pt-BR'];
                                                    if (text) ttsService.speak(text, () => {}, () => {}, 1, lang as any);
                                                  }}
                                                  className={`rounded p-1 transition-colors ${isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'}`}
                                                >
                                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                                                  </svg>
                                                </button>
                                              </>
                                            )}
                                          </div>
                                        </div>
                                        {editingScriptField === field.key ? (
                                          <textarea
                                            value={editingScriptDraft}
                                            onChange={(e) => setEditingScriptDraft(e.target.value)}
                                            className={`${inputClass} h-28 w-full resize-none text-[11px]`}
                                            autoFocus
                                          />
                                        ) : (
                                          <div className={`rounded-lg border p-2 text-[11px] leading-relaxed whitespace-pre-wrap ${isDark ? 'border-slate-700/60 bg-slate-950 text-slate-400' : 'border-slate-200 bg-slate-100 text-slate-700'}`}>
                                            {(field.key === 'en' ? selectedRoomSlide.pitchScript['en-US'] || selectedRoomSlide.pitchScript['en-UK'] : selectedRoomSlide.pitchScript[field.key]) || 'No script'}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                  <button
                                    onClick={() => {
                                      const roomSlideCategory = getSlideCategoryFromSlide(selectedRoomSlide);
                                      setActiveTab('slides');
                                      setActiveSlideCategoryFilter(roomSlideCategory);
                                      setIsCreatingSlide(false);
                                      setSelectedSlideId(selectedRoomSlide.id);
                                    }}
                                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                    </svg>
                                    Edit This Slide
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </section>
                  </div>
                )}

                {/* Knowledge base tab */}
                {activeTab === 'knowledge-base' && (
                  <div className="grid h-full gap-0 xl:grid-cols-[380px_minmax(0,1fr)]">
                    <section className={`flex min-h-0 flex-col border-r p-4 ${isDark ? 'border-slate-700/60 bg-slate-950/40' : 'border-slate-200 bg-slate-50'}`}>
                      <h3 className={`mb-1 text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                        Upload Knowledge Document
                      </h3>
                      <p className="mb-4 text-xs text-slate-500">
                        Upload PDF, DOCX, PPT, and PPTX documents for indexing.
                      </p>

                      <div className="mb-3">
                        <FieldLabel required>Description</FieldLabel>
                        <textarea
                          value={knowledgeBaseUploadDescription}
                          onChange={(event) =>
                            setKnowledgeBaseUploadDescription(event.target.value)
                          }
                          placeholder="What this document is about"
                          disabled={isKnowledgeBaseUploading}
                          className={`${inputClass} h-20 resize-none`}
                        />
                      </div>

                      <div className="mb-3">
                        <FieldLabel required>Tag</FieldLabel>
                        <select
                          value={knowledgeBaseUploadTag}
                          onChange={(event) =>
                            setKnowledgeBaseUploadTag(
                              event.target.value as KnowledgeBaseTag
                            )
                          }
                          disabled={isKnowledgeBaseUploading}
                          className={inputClass}
                        >
                          {KNOWLEDGE_BASE_TAG_OPTIONS.map((tag) => (
                            <option key={tag} value={tag}>
                              {tag}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="mb-3">
                        <FieldLabel required>Document</FieldLabel>
                        <input
                          type="file"
                          accept=".pdf,.docx,.ppt,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                          onChange={(event) =>
                            handleKnowledgeBaseFileChange(
                              event.target.files?.[0] || null
                            )
                          }
                          disabled={isKnowledgeBaseUploading}
                          className={`${inputClass} file:mr-3 file:rounded-md file:border-0 ${isDark ? 'file:bg-slate-700 file:text-slate-100 hover:file:bg-slate-600' : 'file:bg-slate-200 file:text-slate-700 hover:file:bg-slate-300'} file:px-2.5 file:py-1.5 file:text-xs file:font-medium`}
                        />
                        <p className="mt-1 text-[11px] text-slate-500">
                          Max {formatMegabytes(KNOWLEDGE_BASE_MAX_UPLOAD_BYTES)}.
                        </p>
                        {knowledgeBaseUploadFile && (
                          <p className="mt-1 truncate text-xs text-slate-400">
                            {knowledgeBaseUploadFile.name} (
                            {formatFileSize(knowledgeBaseUploadFile.size)})
                          </p>
                        )}
                      </div>

                      {(isKnowledgeBaseUploading ||
                        knowledgeBaseUploadProgress > 0) && (
                        <div className="mb-3">
                          <div className={`h-1.5 w-full overflow-hidden rounded ${isDark ? 'bg-slate-700/70' : 'bg-slate-200'}`}>
                            <div
                              className="h-full bg-blue-500 transition-all"
                              style={{
                                width: `${knowledgeBaseUploadProgress}%`,
                              }}
                            />
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {knowledgeBaseUploadProgress}% uploaded
                          </p>
                        </div>
                      )}

                      <button
                        onClick={handleKnowledgeBaseUpload}
                        disabled={
                          isKnowledgeBaseUploading ||
                          !knowledgeBaseUploadFile ||
                          !knowledgeBaseUploadDescription.trim()
                        }
                        className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                      >
                        {isKnowledgeBaseUploading ? <Spinner /> : null}
                        {isKnowledgeBaseUploading ? 'Uploading...' : 'Upload Document'}
                      </button>
                    </section>

                    <section className="flex min-h-0 flex-col p-4">
                      <div className="mb-3 grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)]">
                        <select
                          value={knowledgeBaseTagFilter}
                          onChange={(event) =>
                            setKnowledgeBaseTagFilter(event.target.value)
                          }
                          className={inputClass}
                        >
                          <option value={KNOWLEDGE_BASE_ALL_TAGS}>
                            All tags ({knowledgeBaseDocuments.length})
                          </option>
                          {KNOWLEDGE_BASE_TAG_OPTIONS.map((tag) => (
                            <option key={tag} value={tag}>
                              {tag} ({knowledgeBaseTagCounts.get(tag) || 0})
                            </option>
                          ))}
                        </select>
                        <div className="relative">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                          </svg>
                          <input
                            value={knowledgeBaseSearch}
                            onChange={(event) =>
                              setKnowledgeBaseSearch(event.target.value)
                            }
                            placeholder="Search filename or description..."
                            className={`w-full rounded-lg border py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 ${isDark ? 'border-slate-600 bg-slate-900 text-slate-100 placeholder-slate-500' : 'border-slate-300 bg-white text-slate-900 placeholder-slate-400'}`}
                          />
                        </div>
                      </div>

                      <p className="mb-2 text-xs text-slate-500">
                        {filteredKnowledgeBaseDocuments.length} of{' '}
                        {knowledgeBaseDocuments.length} document
                        {knowledgeBaseDocuments.length === 1 ? '' : 's'}
                      </p>

                      <div className={`min-h-0 flex-1 overflow-auto rounded-xl border ${isDark ? 'border-slate-700/60 bg-slate-800/20' : 'border-slate-200 bg-white'}`}>
                        <table className="min-w-full divide-y divide-inherit">
                          <thead className={isDark ? 'bg-slate-800/40' : 'bg-slate-100'}>
                            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                              <th className="px-3 py-2 font-medium">File</th>
                              <th className="px-3 py-2 font-medium">Description</th>
                              <th className="px-3 py-2 font-medium">Tag</th>
                              <th className="px-3 py-2 font-medium">Uploaded</th>
                              <th className="px-3 py-2 font-medium">Size</th>
                              <th className="px-3 py-2 font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody className={`divide-y text-sm ${isDark ? 'divide-slate-700/50 text-slate-200' : 'divide-slate-200 text-slate-700'}`}>
                            {filteredKnowledgeBaseDocuments.map((document) => (
                              <tr key={document.id}>
                                <td className="px-3 py-2 align-top">
                                  <p className={`max-w-[280px] truncate font-medium ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                                    {document.fileName}
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-slate-500">
                                    {document.contentType}
                                  </p>
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <p className={`max-w-[360px] truncate ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                    {document.description}
                                  </p>
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${isDark ? 'border-slate-600 bg-slate-800 text-slate-300' : 'border-slate-300 bg-slate-100 text-slate-600'}`}>
                                    {document.tag}
                                  </span>
                                </td>
                                <td className="px-3 py-2 align-top text-xs text-slate-400">
                                  {formatDateTime(document.uploadedAt)}
                                </td>
                                <td className="px-3 py-2 align-top text-xs text-slate-400">
                                  {formatFileSize(document.sizeBytes)}
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <div className="flex gap-2">
                                    <a
                                      href={document.openUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${isDark ? 'border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20' : 'border-blue-400 bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                                    >
                                      Open
                                    </a>
                                    <button
                                      onClick={() =>
                                        requestKnowledgeBaseDelete(document)
                                      }
                                      disabled={isKnowledgeBaseDeleting}
                                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-50 transition-colors ${isDark ? 'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20' : 'border-red-400 bg-red-100 text-red-700 hover:bg-red-200'}`}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {filteredKnowledgeBaseDocuments.length === 0 && (
                              <tr>
                                <td
                                  colSpan={6}
                                  className="px-3 py-8 text-center text-sm text-slate-500"
                                >
                                  No documents found for the selected filters.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </div>
                )}

                {/* Live tab */}
                {activeTab === 'live' && (
                  <div className="grid h-full gap-0 xl:grid-cols-2">
                    {/* Publish section */}
                    <section className={`flex flex-col border-r p-5 ${isDark ? 'border-slate-700/60' : 'border-slate-200'}`}>
                      <div className={`mb-5 flex items-start gap-3 rounded-xl border p-4 ${isDark ? 'border-amber-500/30 bg-amber-500/10' : 'border-amber-600/40 bg-amber-100'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`mt-0.5 w-5 h-5 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                        <div>
                          <p className={`text-sm font-semibold ${isDark ? 'text-amber-400' : 'text-amber-900'}`}>Before publishing</p>
                          <p className={`mt-0.5 text-xs ${isDark ? 'text-amber-600/70' : 'text-amber-800'}`}>
                            Publish copies the current staging content snapshot to the production content container.
                          </p>
                        </div>
                      </div>

                      <h3 className={`mb-1 text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Publish To Production</h3>
                      <p className="mb-1 text-xs text-slate-500">
                        Staging snapshot: {adminContent.summary.slideCount} slides, {adminContent.summary.roomCount} rooms.
                      </p>
                      <p className="mb-4 text-xs text-slate-500">
                        Staging version: <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>{adminContent.summary.version}</span>
                      </p>
                      <p className="mb-4 text-xs text-slate-500">
                        Last staging update: <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>{adminContent.summary.updatedAt}</span>
                      </p>
                      <button
                        onClick={handlePublish}
                        disabled={isLoading}
                        className="flex items-center gap-2 self-start rounded-lg bg-emerald-200 px-5 py-2.5 text-sm font-semibold hover:bg-emerald-300 disabled:opacity-50 transition-colors"
                      >
                        {isLoading ? <Spinner /> : (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                          </svg>
                        )}
                        Publish Staging To Production
                      </button>
                    </section>

                    {/* Indexer section */}
                    <section className="flex flex-col p-5">
                      <h3 className={`mb-1 text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Search Indexer</h3>
                      <p className="mb-4 text-xs text-slate-500">
                        Trigger a manual refresh of the Azure Cognitive Search indexer after publishing so the Q&amp;A agent can find new content.
                      </p>
                      <button
                        onClick={handleIndexerRefresh}
                        disabled={isLoading}
                        className={`flex items-center gap-2 self-start rounded-lg border px-5 py-2.5 text-sm font-medium disabled:opacity-50 transition-colors ${isDark ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                      >
                        {isLoading ? <Spinner /> : (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                          </svg>
                        )}
                        Trigger Indexer Refresh
                      </button>
                    </section>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {knowledgeBaseDeleteTarget && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5">
            <h3 className="text-base font-semibold text-slate-100">
              Delete document?
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              Delete <span className="font-medium text-slate-200">{knowledgeBaseDeleteTarget.fileName}</span> from blob storage?
              This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setKnowledgeBaseDeleteTarget(null)}
                disabled={isKnowledgeBaseDeleting}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmKnowledgeBaseDelete}
                disabled={isKnowledgeBaseDeleting}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
              >
                {isKnowledgeBaseDeleting ? <Spinner /> : null}
                {isKnowledgeBaseDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Slide confirmation modal */}
      {deleteSlideConfirm && selectedSlide && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-xl border p-5 shadow-2xl ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-start gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isDark ? 'bg-red-500/15' : 'bg-red-100'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h3 className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Delete slide?</h3>
                <p className={`mt-1.5 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  You are about to permanently delete{' '}
                  <span className={`font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{selectedSlide.id}</span>.
                  This will also remove its image and video from blob storage.
                </p>
                <p className={`mt-2 text-sm font-medium ${isDark ? 'text-red-400' : 'text-red-600'}`}>This action cannot be undone.</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteSlideConfirm(false)}
                disabled={isDeletingSlide}
                className={`rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50 transition-colors ${isDark ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700' : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSlide}
                disabled={isDeletingSlide}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
              >
                {isDeletingSlide ? <Spinner /> : null}
                {isDeletingSlide ? 'Deleting...' : 'Yes, delete slide'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Room confirmation modal */}
      {deleteRoomConfirm && selectedRoom && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-xl border p-5 shadow-2xl ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-start gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isDark ? 'bg-red-500/15' : 'bg-red-100'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h3 className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Delete room?</h3>
                <p className={`mt-1.5 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  You are about to permanently delete room{' '}
                  <span className={`font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{selectedRoom.roomId}</span>
                  {selectedRoom.name ? ` (${selectedRoom.name})` : ''}.
                  The slides themselves will not be deleted.
                </p>
                <p className={`mt-2 text-sm font-medium ${isDark ? 'text-red-400' : 'text-red-600'}`}>This action cannot be undone.</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteRoomConfirm(false)}
                disabled={isDeletingRoom}
                className={`rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50 transition-colors ${isDark ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700' : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteRoom}
                disabled={isDeletingRoom}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
              >
                {isDeletingRoom ? <Spinner /> : null}
                {isDeletingRoom ? 'Deleting...' : 'Yes, delete room'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logs Panel*/}


      {/*{showLogs && (
        <div className="fixed inset-0 z-[130] bg-black/50 flex items-end">
          <div className="w-full bg-slate-900 border-t border-slate-800 max-h-96 flex flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-6 py-3 bg-slate-800/50">
              <div>
                <h3 className="font-semibold text-slate-100">Activity Logs</h3>
                <p className="text-xs text-slate-400">{logs.length} entries</p>
              </div>
              <button
                onClick={() => setShowLogs(false)}
                className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-700 rounded transition-colors"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {logs.length === 0 ? (
                <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                  No activity yet
                </div>
              ) : (
                <div className="space-y-0">
                  {logs.map((log) => (
                    <div key={log.id} className="border-b border-slate-800 px-6 py-2 hover:bg-slate-800/30 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="text-xs font-mono text-slate-500 pt-0.5 min-w-fit">{log.timestamp}</div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium ${
                              log.status === 'success' ? 'text-green-400' :
                              log.status === 'error' ? 'text-red-400' :
                              'text-blue-400'
                            }`}>
                              {log.status === 'success' ? 'OK' : log.status === 'error' ? 'X' : 'i'}
                            </span>
                            <span className="text-sm text-slate-200 font-medium">{log.action}</span>
                          </div>
                          {log.details && (
                            <p className="text-xs text-slate-400 mt-1 ml-5">{log.details}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )} */}
    </div>
  );
};

export default AdminPanel;
