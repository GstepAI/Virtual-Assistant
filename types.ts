
export interface Slide {
  id: string;
  title: string;
  imageUrl: string;
  videoUrl?: string; // Optional video URL - plays before showing image
  description: string;
  QnA?: boolean; // Optional flag to include this slide in Q&A mode (must be explicitly set to true to be included)
  pitchScript: {
    'en-US': string;
    'en-UK': string;
    'pt-BR': string;
  };
}

export interface ChatMessage {
  sender: 'user' | 'agent';
  text: string;
}


export interface GeminiResponse {
  answer: string;
  slideId: string;
}

export type AppMode = 'pitch' | 'qa';

export type Language = 'en-US' | 'pt-BR'  | 'en-UK' ;

export type VoiceGender = 'male' | 'female';

export interface Participant {
  id: string;
  name: string;
  isAgent: boolean;
  isSpeaking: boolean;
  videoSrc: string;
}
