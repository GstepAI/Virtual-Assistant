/**
 * Speech-to-Text Service using Azure Speech Services.
 * Provides continuous speech recognition with better quality than browser STT.
 *
 * This implementation uses client-side Azure Speech SDK for real-time streaming recognition.
 */

import type { Language } from '../types';
import { canProcessInteractions } from './consentService';

// Language code mappings for Azure Speech Services
// Our app uses 'en-UK' but Azure expects 'en-GB'
const LANGUAGE_MAP: Record<string, string> = {
  'en-US': 'en-US',
  'en-UK': 'en-GB', // Azure uses en-GB for UK English.
  'pt-BR': 'pt-BR'
};

// Dynamically import Azure Speech SDK (loaded from CDN or npm package)
declare global {
  interface Window {
    SpeechSDK: any;
    Microsoft?: {
      CognitiveServices?: {
        Speech?: any;
      };
    };
  }
}

export interface STTConfig {
  language: Language;
  onInterimResult?: (text: string) => void;
  onFinalResult: (text: string) => void;
  onError?: (error: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  /** Delay in milliseconds before sending final result (allows user to pause while speaking). Default: 1500ms */
  pauseDelay?: number;
}

export class AzureSTTService {
  private recognizer: any = null;
  private isRecording = false;
  private config: STTConfig;
  private lastRecognizedText = '';
  private lastRecognizedTime = 0;
  private pendingText = '';
  private sendTimer: NodeJS.Timeout | null = null;

  constructor(config: STTConfig) {
    this.config = config;
  }

  /**
   * Start continuous speech recognition
   */
  async start(): Promise<void> {
    // GDPR: Check consent before processing voice through Azure Speech
    if (!canProcessInteractions()) {
      const error = 'Voice processing not consented. Please accept voice & text processing in privacy settings.';
      console.warn(error);
      this.config.onError?.(error);
      return;
    }

    if (this.isRecording) {
      console.warn('STT already recording');
      return;
    }

    try {
      // Fetch Azure credentials from API
      const response = await fetch('/api/azure-stt-token');
      if (!response.ok) {
        throw new Error('Failed to get Azure Speech token');
      }

      const { token, region } = await response.json();

      // Check if Speech SDK is available (try both global variable names)
      const SpeechSDK = window.SpeechSDK || window.Microsoft?.CognitiveServices?.Speech;

      if (!SpeechSDK) {
        throw new Error('Azure Speech SDK not loaded. Please ensure the SDK is included in your page.');
      }

      // Create speech config with token
      const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);
      // Map our language codes to Azure's expected codes
      const azureLanguage = LANGUAGE_MAP[this.config.language] || this.config.language;
      console.log('Azure STT: Original language:', this.config.language, '→ Mapped language:', azureLanguage);
      speechConfig.speechRecognitionLanguage = azureLanguage;
      console.log('Azure STT: speechConfig.speechRecognitionLanguage after setting:', speechConfig.speechRecognitionLanguage);

      // Enable continuous recognition
      const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();

      // Create recognizer
      this.recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

      // Handle recognizing event (interim results)
      this.recognizer.recognizing = (_s: any, e: any) => {
        if (e.result.text && this.config.onInterimResult) {
          this.config.onInterimResult(e.result.text);
        }
      };

      // Handle recognized event (final results)
      this.recognizer.recognized = (_s: any, e: any) => {
        if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
          const text = e.result.text;
          if (text && text.trim()) {
            const now = Date.now();

            // Normalize text for comparison (remove punctuation, lowercase)
            const normalizedText = text.toLowerCase().replace(/[.,!?;:]/g, '').trim();
            const normalizedLast = this.lastRecognizedText.toLowerCase().replace(/[.,!?;:]/g, '').trim();

            // Deduplicate: Ignore if same/similar text was recognized within 2 seconds
            if (normalizedText === normalizedLast && now - this.lastRecognizedTime < 2000) {
              console.log('Azure STT: Ignoring duplicate recognition:', text);
              return;
            }

            this.lastRecognizedText = text;
            this.lastRecognizedTime = now;

            console.log('Azure STT recognized:', text);

            // Clear any existing timer
            if (this.sendTimer) {
              clearTimeout(this.sendTimer);
            }

            // Accumulate text if there's already pending text
            if (this.pendingText) {
              this.pendingText += ' ' + text;
            } else {
              this.pendingText = text;
            }

            // Set up delayed send (debounce)
            const delay = this.config.pauseDelay ?? 2000;
            this.sendTimer = setTimeout(() => {
              if (this.pendingText) {
                console.log('Azure STT sending after pause:', this.pendingText);
                this.config.onFinalResult(this.pendingText);
                this.pendingText = '';
                this.sendTimer = null;
              }
            }, delay);
          }
        } else if (e.result.reason === SpeechSDK.ResultReason.NoMatch) {
          console.log('Azure STT: No speech recognized');
        }
      };

      // Handle canceled event
      this.recognizer.canceled = (_s: any, e: any) => {
        console.error('Azure STT canceled:', e.reason);
        if (e.reason === SpeechSDK.CancellationReason.Error) {
          console.error('Azure STT error details:', e.errorDetails);
          if (this.config.onError) {
            this.config.onError(e.errorDetails);
          }
        }
        this.stop();
      };

      // Handle session stopped event
      this.recognizer.sessionStopped = (_s: any, _e: any) => {
        console.log('Azure STT session stopped');
        this.stop();
      };

      // Start continuous recognition
      this.recognizer.startContinuousRecognitionAsync(
        () => {
          this.isRecording = true;
          console.log('Azure STT continuous recognition started');
          if (this.config.onStart) {
            this.config.onStart();
          }
        },
        (err: any) => {
          console.error('Failed to start Azure STT:', err);
          if (this.config.onError) {
            this.config.onError(err);
          }
          this.stop();
        }
      );

    } catch (error: any) {
      console.error('Failed to start Azure STT:', error);
      if (this.config.onError) {
        this.config.onError(error.message || 'Failed to start speech recognition');
      }
      this.stop();
    }
  }

  /**
   * Stop speech recognition
   */
  stop(): void {
    if (!this.isRecording && !this.recognizer) {
      return;
    }

    // Clear pending timer and send any accumulated text
    if (this.sendTimer) {
      clearTimeout(this.sendTimer);
      this.sendTimer = null;

      // Send any pending text before stopping
      if (this.pendingText) {
        console.log('Azure STT sending pending text on stop:', this.pendingText);
        this.config.onFinalResult(this.pendingText);
        this.pendingText = '';
      }
    }

    if (this.recognizer) {
      this.recognizer.stopContinuousRecognitionAsync(
        () => {
          console.log('Azure STT stopped successfully');
          if (this.recognizer) {
            this.recognizer.close();
            this.recognizer = null;
          }
        },
        (err: any) => {
          console.error('Error stopping Azure STT:', err);
          if (this.recognizer) {
            this.recognizer.close();
            this.recognizer = null;
          }
        }
      );
    }

    this.isRecording = false;
    this.lastRecognizedText = '';
    this.lastRecognizedTime = 0;

    if (this.config.onEnd) {
      this.config.onEnd();
    }

    console.log('Azure STT stopped');
  }

  /**
   * Check if currently recording
   */
  isActive(): boolean {
    return this.isRecording;
  }

  /**
   * Update language configuration
   */
  setLanguage(language: Language): void {
    this.config.language = language;
    // Note: Changing language requires restarting the recognizer
    if (this.isRecording) {
      console.warn('Language change detected. Please restart recognition for changes to take effect.');
    }
  }
}
