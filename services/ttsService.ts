/**
 * Text-to-Speech Service using Azure Speech Services.
 * Falls back to Web Speech API if Azure is unavailable.
 */

import type { Language, VoiceGender } from '../types';
import { canProcessInteractions } from './consentService';

let currentLanguage: Language = 'en-US';
let currentVoiceGender: VoiceGender = 'female';
let currentAudio: HTMLAudioElement | null = null;
const USE_AZURE_TTS = true; // Set to false to use browser TTS

// Web Audio API context for better echo cancellation
let audioContext: AudioContext | null = null;
let currentSourceNode: AudioBufferSourceNode | null = null;
let gainNode: GainNode | null = null;

// Track the current speech request ID - incremented on each new speech
let currentSpeechRequestId = 0;

// Track pause state
let isPaused = false;

/**
 * Initialize Web Audio API context
 */
function initAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    gainNode = audioContext.createGain();
    gainNode.gain.value = 1.0; // Default volume
    gainNode.connect(audioContext.destination);
  }
  return audioContext;
}

// Pre-initialize AudioContext on first import to reduce latency
if (typeof window !== 'undefined') {
  // Defer initialization slightly to avoid blocking page load
  setTimeout(() => {
    initAudioContext();
  }, 100);
}

// Browser TTS fallback
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
let voices: SpeechSynthesisVoice[] = [];

// Function to populate the voices array for fallback
function populateVoiceList() {
  if (synth) {
    voices = synth.getVoices();
  }
}

// Populate voices initially and set up a listener for when they change
if (synth) {
  populateVoiceList();
  if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = populateVoiceList;
  }
}

/**
 * Set the language for text-to-speech.
 * @param language The language code to use.
 */
export function setLanguage(language: Language) {
  currentLanguage = language;
}

/**
 * Set the voice gender for text-to-speech.
 * @param voiceGender The voice gender to use.
 */
export function setVoiceGender(voiceGender: VoiceGender) {
  currentVoiceGender = voiceGender;
}


/**
 * Speaks using Azure Speech Services with Web Audio API
 */
async function speakWithAzure(text: string, onStart: () => void, onEnd: () => void, language: Language, voiceGender: VoiceGender) {
  // Increment and capture this request's ID
  currentSpeechRequestId += 1;
  const thisRequestId = currentSpeechRequestId;

  try {
    const response = await fetch('/api/azure-tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        language,
        voiceGender
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to synthesize speech');
    }

    const data = await response.json();

    // Check if a newer speech was started while we were fetching
    if (thisRequestId !== currentSpeechRequestId) {
      console.log(`Discarding audio for request ${thisRequestId} - current is ${currentSpeechRequestId}`);
      return; // Don't play this audio
    }

    // Stop any currently playing audio
    if (currentSourceNode) {
      try {
        currentSourceNode.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      currentSourceNode = null;
    }

    // Initialize Web Audio API context
    const ctx = initAudioContext();
    if (!ctx || !gainNode) {
      throw new Error('Failed to initialize audio context');
    }

    // Resume audio context if suspended (required by browser autoplay policies)
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    // Convert base64 to ArrayBuffer
    const base64Data = data.audioData;
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Decode audio data
    const audioBuffer = await ctx.decodeAudioData(bytes.buffer);

    // Check again if a newer speech was started while we were decoding
    if (thisRequestId !== currentSpeechRequestId) {
      console.log(`Discarding decoded audio for request ${thisRequestId} - current is ${currentSpeechRequestId}`);
      return; // Don't play this audio
    }

    // Create source node
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(gainNode);
    currentSourceNode = source;

    // Set up callbacks
    source.onended = () => {
      currentSourceNode = null;
      onEnd();
    };

    // Start playback
    onStart();
    source.start(0);

  } catch (error) {
    console.error('Azure TTS failed, falling back to browser TTS:', error);
    // Fall back to browser TTS
    speakWithBrowser(text, onStart, onEnd, 1, language, voiceGender);
  }
}

/**
 * Fallback: Speaks using browser's Web Speech API
 */
function speakWithBrowser(text: string, onStart: () => void, onEnd: () => void, pitch: number = 1, language?: Language, voiceGender?: VoiceGender) {
  if (!synth) {
    console.error('Speech synthesis not available');
    onEnd();
    return;
  }

  // If voices are not ready yet, wait a moment and retry
  if (voices.length === 0) {
    setTimeout(() => speakWithBrowser(text, onStart, onEnd, pitch, language, voiceGender), 100);
    return;
  }

  const doSpeak = () => {
    if (text !== '') {
      const utterance = new SpeechSynthesisUtterance(text);
      const effectiveLanguage = language || currentLanguage;
      const effectiveVoiceGender = voiceGender || currentVoiceGender;

      // Select voice based on gender preference
      const genderKeywords = effectiveVoiceGender === 'male' ? ['Male', 'Masculine'] : ['Female', 'Feminine'];

      let preferredVoice = voices.find(v =>
        v.lang === effectiveLanguage &&
        v.name.includes('Google') &&
        genderKeywords.some(keyword => v.name.includes(keyword))
      );

      if (!preferredVoice) {
        preferredVoice = voices.find(v => v.lang === effectiveLanguage && v.name.includes('Google'));
      }

      utterance.voice = preferredVoice || voices.find(v => v.lang === effectiveLanguage) || null;
      utterance.lang = effectiveLanguage;
      utterance.rate = 1;
      utterance.pitch = pitch;

      utterance.onstart = onStart;
      utterance.onend = onEnd;
      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        console.error('SpeechSynthesisUtterance.onerror:', event.error);
        onEnd();
      };

      synth.speak(utterance);
    } else {
      onEnd();
    }
  };

  if (synth.speaking) {
    synth.cancel();
    setTimeout(doSpeak, 100);
  } else {
    doSpeak();
  }
}

/**
 * Speaks the provided text aloud using Azure Speech Services.
 * Falls back to browser TTS if Azure fails.
 * @param text The text to be spoken.
 * @param onStart Callback function when speech starts.
 * @param onEnd Callback function when speech ends.
 * @param pitch Optional pitch value (0-2, default 1) - only used for browser TTS fallback.
 * @param language Optional language override for this specific utterance.
 * @param voiceGender Optional voice gender override for this specific utterance.
 */
export function speak(text: string, onStart: () => void, onEnd: () => void, pitch: number = 1, language?: Language, voiceGender?: VoiceGender) {
  if (text === '') {
    onEnd();
    return;
  }

  // GDPR: Check consent before processing text through Azure Speech
  // Note: TTS is output only, but still uses Azure cloud services
  if (!canProcessInteractions()) {
    console.warn('Voice processing not consented. TTS disabled.');
    onEnd();
    return;
  }

  const effectiveLanguage = language || currentLanguage;
  const effectiveVoiceGender = voiceGender || currentVoiceGender;

  if (USE_AZURE_TTS) {
    speakWithAzure(text, onStart, onEnd, effectiveLanguage, effectiveVoiceGender);
  } else {
    speakWithBrowser(text, onStart, onEnd, pitch, effectiveLanguage, effectiveVoiceGender);
  }
}

/**
 * Cancels any ongoing or pending speech.
 * This will trigger the `onend` callback of the utterance that was speaking.
 */
export function cancel() {
  // Increment speech request ID to invalidate all pending audio requests
  currentSpeechRequestId += 1;

  // Reset pause state
  isPaused = false;

  // Stop Web Audio API source if playing
  if (currentSourceNode) {
    try {
      currentSourceNode.stop();
    } catch (e) {
      // Ignore if already stopped
    }
    currentSourceNode = null;
  }

  // Stop legacy HTMLAudioElement if playing
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  // Cancel browser TTS if active
  if (synth) {
    synth.cancel();
  }

  // Resume audio context if it was suspended (for clean state)
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

/**
 * Pauses the current speech playback.
 * Audio can be resumed from the same position with resume().
 * @returns Promise that resolves when audio is paused
 */
export async function pause(): Promise<void> {
  if (isPaused) return;

  isPaused = true;

  // Suspend Web Audio API context to pause playback
  if (audioContext && audioContext.state === 'running') {
    await audioContext.suspend();
    console.log('🔇 TTS paused via AudioContext.suspend()');
  }

  // Pause browser TTS if active
  if (synth && synth.speaking) {
    synth.pause();
    console.log('🔇 Browser TTS paused');
  }
}

/**
 * Resumes paused speech playback.
 * @returns Promise that resolves when audio is resumed
 */
export async function resume(): Promise<void> {
  if (!isPaused) return;

  isPaused = false;

  // Resume Web Audio API context
  if (audioContext && audioContext.state === 'suspended') {
    await audioContext.resume();
    console.log('🔊 TTS resumed via AudioContext.resume()');
  }

  // Resume browser TTS if paused
  if (synth && synth.paused) {
    synth.resume();
    console.log('🔊 Browser TTS resumed');
  }
}

/**
 * Check if TTS is currently paused.
 * @returns true if paused, false otherwise
 */
export function getIsPaused(): boolean {
  return isPaused;
}