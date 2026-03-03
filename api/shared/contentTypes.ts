export type SupportedLanguage = 'en-US' | 'en-UK' | 'pt-BR';

export interface Slide {
  id: string;
  title: string;
  imageUrl: string;
  videoUrl?: string;
  description: string;
  QnA?: boolean;
  pitchScript: Record<SupportedLanguage, string>;
}

export interface RoomIdComponents {
  prefix: string;
  audience: string;
  module: string;
  focus: string;
}

export interface RoomConfiguration {
  roomId: string;
  name: string;
  description: string;
  components: RoomIdComponents;
  slideSequence: string[];
  defaultLanguage?: SupportedLanguage;
  metadata?: {
    targetAudience?: string;
    includesGoldenVisa?: boolean;
    includesNextTech?: boolean;
    includesOpenEnded?: boolean;
    [key: string]: unknown;
  };
}

export interface RoomConfigurationSet {
  version: string;
  lastUpdated: string;
  configurations: RoomConfiguration[];
}

export interface SlidesPayload {
  ALL_SLIDES: Slide[];
  PITCH_SLIDES: Slide[];
}

export interface ContentSnapshot {
  slides: Slide[];
  rooms: RoomConfiguration[];
  roomConfigVersion: string;
  roomConfigLastUpdated: string;
}

export interface ContentStore {
  schemaVersion: string;
  updatedAt: string;
  version: number;
  slides: Slide[];
  rooms: RoomConfiguration[];
  roomConfigVersion: string;
  roomConfigLastUpdated: string;
}
