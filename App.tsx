
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Slide, ChatMessage, AppMode, Participant, Language, VoiceGender } from './types';
import slidesData from './config/slides.json';
import roomConfigData from './config/roomConfigurations.json';
import { getQaAnswer } from './services/aiService';
import * as ttsService from './services/ttsService';
import { sendSessionData, prepareSessionData, endSessionOnUnload } from './services/sessionDataService';
import { useLanguage } from './contexts/LanguageContext';
import { getSlidesByIds } from './utils/slideMapper';
import { stripMarkdownForTTS } from './utils/textUtils';
import type { RoomConfiguration, RoomConfigurationSet } from './types/roomConfig';
import { loadContentBundle } from './services/contentDataService';
import SlideViewer from './components/SlideViewer';
import ChatPanel from './components/ChatPanel';
import ModeSelector from './components/ModeSelector';
import Lobby from './components/Lobby';
import ListeningIndicator from './components/ListeningIndicator';
import ConfirmResetModal from './components/ConfirmResetModal';
import BugReportModal from './components/BugReportModal';
import LanguageSwitch from './components/LanguageSwitch';
import ComplianceBanner from './components/ComplianceBanner';
import { SpeakerOnIcon, SpeakerOffIcon, EndCallIcon, ClockIcon, ChatIcon, CloseIcon, BugReportIcon, SunIcon, MoonIcon, ShieldIcon } from './components/icons';
import { sendBugReport } from './services/bugReportService';
import { useRuntimeConfig } from './hooks/useRuntimeConfig';

const AVATAR_VIDEO_URL = "https://assets.mixkit.co/videos/preview/mixkit-woman-in-a-busy-street-smiles-at-the-camera-41338-large.mp4";
const MOCK_PARTICIPANT_VIDEO_URL = "https://assets.mixkit.co/videos/preview/mixkit-man-in-a-suit-sits-in-an-office-52382-large.mp4";

const LOCAL_ALL_SLIDES = slidesData.ALL_SLIDES as Slide[];
const LOCAL_ROOM_CONFIGS = (roomConfigData as RoomConfigurationSet).configurations || [];

const findRoomConfiguration = (
  configurations: RoomConfiguration[],
  room: string
): RoomConfiguration | null => {
  const normalizedRoomId = room.trim().toUpperCase();
  return (
    configurations.find(
      (configuration) => configuration.roomId === normalizedRoomId
    ) || null
  );
};

// Speech service wrapper
const speechService = {
  speak: (text: string, onStart: () => void, onEnd: () => void, pitch: number = 1, language?: Language, voiceGender?: VoiceGender) => {
    ttsService.speak(text, onStart, onEnd, pitch, language, voiceGender);
  },
  cancel: () => {
    ttsService.cancel();
  },
  pause: () => {
    return ttsService.pause();
  },
  resume: () => {
    return ttsService.resume();
  },
  setLanguage: (language: Language) => {
    ttsService.setLanguage(language);
  },
  setVoiceGender: (voiceGender: VoiceGender) => {
    ttsService.setVoiceGender(voiceGender);
  }
};

const App: React.FC = () => {
  const { qnaEnabled: isQnaEnabled, bugReportEnabled: isBugReportEnabled } = useRuntimeConfig();
  const { language, setLanguage, voiceGender, setVoiceGender } = useLanguage();
  const [mode, setMode] = useState<AppMode>('pitch');
  const [pitchSlideIndex, setPitchSlideIndex] = useState(0);
  const [allSlides, setAllSlides] = useState<Slide[]>(LOCAL_ALL_SLIDES);
  const [roomConfigurations, setRoomConfigurations] =
    useState<RoomConfiguration[]>(LOCAL_ROOM_CONFIGS);
  const [contentSource, setContentSource] = useState<'api' | 'local'>('local');
  const [qaSlide, setQaSlide] = useState<Slide | null>(
    LOCAL_ALL_SLIDES.find(s => s.id === 'bluecrow_end') || LOCAL_ALL_SLIDES[0]
  );
  const [pitchChatHistory, setPitchChatHistory] = useState<ChatMessage[]>([]);
  const [qaChatHistory, setQaChatHistory] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTtsEnabled, setIsTtsEnabled] = useState(true);
  const [isTtsPaused, setIsTtsPaused] = useState(false); // Track if TTS is paused (not disabled)
  const [qaQueue, setQaQueue] = useState<string[]>([]);

  // New state for call functionality
  const [isInCall, setIsInCall] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [roomId, setRoomId] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isPitchStarted, setIsPitchStarted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isChatVisible, setIsChatVisible] = useState(false); // Chat hidden by default
  const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);
  const [isAgentReady, setIsAgentReady] = useState(false); // Track agent readiness
  const [isMicMuted, setIsMicMuted] = useState(false); // Track if user's microphone is muted
  const [sttInput, setSttInput] = useState(''); // Track STT input for listening indicator
  const [isListening, setIsListening] = useState(false); // Track if STT is currently listening
  const [showResetModal, setShowResetModal] = useState(false); // Track confirmation modal visibility
  const [showBugReportModal, setShowBugReportModal] = useState(false); // Track bug report modal visibility
  const [isDarkTheme, setIsDarkTheme] = useState(false); // Theme toggle: true = dark, false = light

  // Dynamic pitch slides based on room configuration (no default slides)
  const [activePitchSlides, setActivePitchSlides] = useState<Slide[]>([]);

  const wasInterruptedRef = useRef(false);
  const scrollPositionRef = useRef(0);
  const stopVoiceModeRef = useRef<(() => void) | null>(null); // Ref to ChatPanel's stopVoiceMode function
  const wasPausedBeforeModalRef = useRef(false); // Track if TTS was paused before opening bug report modal
  const autoAdvanceTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Track pending auto-advance
  const currentSpeechIdRef = useRef(0); // Track which speech is current to prevent stale callbacks
  const slideSkippedWhileMutedRef = useRef(false); // Track if a slide was skipped while TTS was muted
  const roomConfigurationsRef = useRef<RoomConfiguration[]>(roomConfigurations);

  // Refs to capture current session state for page unload
  const sessionStateRef = useRef({
    isInCall: false,
    userName: '',
    userEmail: '',
    roomId: '',
    language: language,
    callDuration: 0,
    pitchChatHistory: [] as ChatMessage[],
    qaChatHistory: [] as ChatMessage[],
  });

  // Keep session state ref updated for page unload handler
  useEffect(() => {
    sessionStateRef.current = {
      isInCall,
      userName,
      userEmail,
      roomId,
      language,
      callDuration,
      pitchChatHistory,
      qaChatHistory,
    };
  }, [isInCall, userName, userEmail, roomId, language, callDuration, pitchChatHistory, qaChatHistory]);

  // Keep room configurations available to unload handlers without stale closure state
  useEffect(() => {
    roomConfigurationsRef.current = roomConfigurations;
  }, [roomConfigurations]);

  // Load content from API (or local fallback) once on app boot.
  useEffect(() => {
    let isMounted = true;

    const loadContent = async () => {
      const bundle = await loadContentBundle();
      if (!isMounted) {
        return;
      }
      setAllSlides(bundle.slides);
      setRoomConfigurations(bundle.roomConfigSet.configurations || []);
      setContentSource(bundle.source);
      console.log(
        `[Content] Loaded ${bundle.slides.length} slides and ${
          bundle.roomConfigSet.configurations?.length || 0
        } rooms from ${bundle.source.toUpperCase()}`
      );
    };

    loadContent();
    return () => {
      isMounted = false;
    };
  }, []);

  // Ensure Q&A has a valid default slide when content source changes.
  useEffect(() => {
    if (allSlides.length === 0) {
      setQaSlide(null);
      return;
    }

    setQaSlide((previous) => {
      if (previous && allSlides.some((slide) => slide.id === previous.id)) {
        return previous;
      }
      return allSlides.find((slide) => slide.id === 'bluecrow_end') || allSlides[0];
    });
  }, [allSlides]);

  // Sync language changes with TTS service
  useEffect(() => {
    speechService.setLanguage(language);
    console.log('Language changed to:', language);
  }, [language]);

  // Sync voice gender changes with TTS service
  useEffect(() => {
    speechService.setVoiceGender(voiceGender);
    console.log('Voice gender changed to:', voiceGender);
  }, [voiceGender]);

  // Restart pitch speech immediately when language changes in Pitch mode
  useEffect(() => {
    // Only restart if in Pitch mode and pitch has started (agent is speaking)
    if (mode !== 'pitch' || !isPitchStarted) return;

    console.log('🌐 Language changed in Pitch mode, restarting current slide speech');

    // Cancel current speech
    wasInterruptedRef.current = true;
    speechService.cancel();

    // Clear any pending auto-advance
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    // Get current slide script in new language
    const slide = activePitchSlides[pitchSlideIndex];
    if (slide && slide.pitchScript) {
      const newLanguageScript = slide.pitchScript[language];

      // Update pitch chat history with new language
      setPitchChatHistory([{ sender: 'agent', text: newLanguageScript }]);

      // Restart speech in new language
      speakText(newLanguageScript);
    }
  }, [language]); // Only trigger on language changes

  // Restart pitch speech immediately when voice gender changes in Pitch mode
  useEffect(() => {
    // Only restart if in Pitch mode and pitch has started (agent is speaking)
    if (mode !== 'pitch' || !isPitchStarted) return;

    console.log('🎤 Voice gender changed in Pitch mode, restarting current slide speech');

    // Cancel current speech
    wasInterruptedRef.current = true;
    speechService.cancel();

    // Clear any pending auto-advance
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    // Get current slide script
    const slide = activePitchSlides[pitchSlideIndex];
    if (slide && slide.pitchScript) {
      const currentScript = slide.pitchScript[language];

      // Restart speech with new voice gender
      speakText(currentScript);
    }
  }, [voiceGender]); // Only trigger on voice gender changes

  // Cleanup TTS and send session data on page unload/refresh
  useEffect(() => {
    // Flag to track if session end has been triggered
    let sessionEndTriggered = false;

    const handlePageUnload = () => {
      // Always cancel TTS
      speechService.cancel();

      // Get current session state from ref (always up-to-date)
      const currentState = sessionStateRef.current;

      // Only send session data if user is in an active call
      if (currentState.isInCall && !sessionEndTriggered) {
        sessionEndTriggered = true;

        console.log('🚪 Page unload detected - preparing to send session data via sendBeacon');

        // Get room configuration data from active content source
        const roomConfig = findRoomConfiguration(
          roomConfigurationsRef.current,
          currentState.roomId
        );

        // Prepare session data using shared helper
        const sessionData = prepareSessionData({
          userName: currentState.userName,
          userEmail: currentState.userEmail,
          roomId: currentState.roomId,
          roomIdComponents: roomConfig?.components,
          roomConfigName: roomConfig?.name,
          language: currentState.language,
          callDuration: currentState.callDuration,
          pitchChatHistory: currentState.pitchChatHistory,
          qaChatHistory: currentState.qaChatHistory,
        });

        console.log('📤 Sending session data via sendBeacon:', {
          userName: currentState.userName,
          roomId: currentState.roomId,
          callDuration: currentState.callDuration,
        });

        // Use sendBeacon for reliable delivery during page unload
        endSessionOnUnload(sessionData);
      }
    };

    // Primary event - most reliable for page unload
    window.addEventListener('pagehide', handlePageUnload);

    return () => {
      window.removeEventListener('pagehide', handlePageUnload);
      speechService.cancel();
    };
  }, []); // Empty dependency array - listeners registered once and use ref for current state

  // Timer effect
  useEffect(() => {
    if (!isInCall) {
      setCallDuration(0);
      return;
    }

    const timerId = setInterval(() => {
      setCallDuration(prevDuration => prevDuration + 1);
    }, 1000);

    return () => {
      clearInterval(timerId);
    };
  }, [isInCall]);

  // Prevent scroll jumps when slide changes
  useEffect(() => {
    const handleScroll = () => {
      scrollPositionRef.current = window.scrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Lock scroll position when slide index changes
  useEffect(() => {
    if (!isPitchStarted) return;

    const savedPosition = scrollPositionRef.current;

    // Use animation frame for smooth, fast scroll restoration
    const restoreScroll = () => {
      if (window.scrollY !== savedPosition) {
        window.scrollTo(0, savedPosition);
      }
    };

    // Restore on next animation frame (faster than setTimeout)
    const rafId = requestAnimationFrame(restoreScroll);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [pitchSlideIndex, isPitchStarted]);

 const speakText = useCallback((text: string) => {
    console.log('🗣️ speakText callback RECREATED - isTtsEnabled:', isTtsEnabled, 'mode:', mode, 'isPitchStarted:', isPitchStarted, 'pitchSlideIndex:', pitchSlideIndex, 'language:', language);

    // Cancel any pending auto-advance timeout when starting new speech
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    if (isTtsEnabled && !isTtsPaused) {
      slideSkippedWhileMutedRef.current = false;
      // Increment speech ID to track this specific speech instance
      currentSpeechIdRef.current += 1;
      const thisSpeechId = currentSpeechIdRef.current;

      const onEndCallback = () => {
        // Ignore callbacks from old/cancelled speeches
        if (thisSpeechId !== currentSpeechIdRef.current) {
          console.log(`Ignoring stale onEnd callback from speech ${thisSpeechId}, current is ${currentSpeechIdRef.current}`);
          return;
        }

        setParticipants(prev => prev.map(p => p.isAgent ? { ...p, isSpeaking: false } : p));

        // Only auto-advance if not interrupted
        if (mode === 'pitch' && isPitchStarted && !wasInterruptedRef.current) {
          // Check if it's not the last slide
          if (pitchSlideIndex < activePitchSlides.length - 1) {
            // Use a timeout for a natural pause before the next slide
            autoAdvanceTimeoutRef.current = setTimeout(() => {
              // Double-check not interrupted AND speech ID still matches
              if (!wasInterruptedRef.current && thisSpeechId === currentSpeechIdRef.current) {
                setPitchSlideIndex(prev => prev + 1);
              }
              autoAdvanceTimeoutRef.current = null;
            }, 500);
          } else {
            // Last slide finished - automatically switch to Q&A mode (only if Q&A is enabled)
            if (isQnaEnabled) {
              autoAdvanceTimeoutRef.current = setTimeout(() => {
                // Check speech ID still matches
                if (thisSpeechId === currentSpeechIdRef.current) {
                  setMode('qa');
                  setIsChatVisible(false); // Start Q&A with chat hidden
                  setQaSlide(allSlides.find(s => s.id === 'bluecrow_end') || allSlides[0] || null);
                }
                autoAdvanceTimeoutRef.current = null;
              }, 1000);
            }
            // When Q&A is disabled, pitch just stays on the last slide after completion
          }
        }
      };

      const onStartCallback = () => {
        // Ignore callbacks from old/cancelled speeches
        if (thisSpeechId !== currentSpeechIdRef.current) {
          console.log(`Ignoring stale onStart callback from speech ${thisSpeechId}, current is ${currentSpeechIdRef.current}`);
          return;
        }

        // When a new speech begins, any prior interruption is now irrelevant for this speech's lifecycle.
        wasInterruptedRef.current = false;
        setParticipants(prev => prev.map(p => p.isAgent ? { ...p, isSpeaking: true } : p));
      };

      speechService.speak(
        text,
        onStartCallback,
        onEndCallback,
        1,
        language
      );
    } else {
      setParticipants(prev => prev.map(p => p.isAgent ? { ...p, isSpeaking: false } : p));
    }
  }, [isTtsEnabled, isTtsPaused, mode, isPitchStarted, pitchSlideIndex, language, allSlides]);

  useEffect(() => {
    console.log('📝 Main effect running - mode:', mode, 'pitchSlideIndex:', pitchSlideIndex, 'isPitchStarted:', isPitchStarted, 'isInCall:', isInCall, 'language:', language);

    if (!isInCall) return;

    let initialMessage = "";
    let shouldSpeak = true;

    if (mode === 'pitch') {
      if (isPitchStarted) {
        // Defensive check: ensure slide exists
        const slide = activePitchSlides[pitchSlideIndex];
        if (!slide || !slide.pitchScript) {
          console.error('Invalid pitch slide index:', pitchSlideIndex);
          return;
        }
        initialMessage = slide.pitchScript[language];
        console.log('📝 Setting pitch chat history to pitch script');
        setPitchChatHistory([{ sender: 'agent', text: initialMessage }]);
      } else {
        initialMessage = "When everyone is ready, press 'Start Pitch' to begin the presentation.";
        console.log('📝 Setting pitch chat history to waiting message');
        setPitchChatHistory([{ sender: 'agent', text: initialMessage }]);
        shouldSpeak = false; // Don't speak the waiting message
        setPitchSlideIndex(0); // Ensure we're on the first slide.
      }
    } else { // QA Mode
      // Only set initial Q&A message if history is empty (first time entering Q&A)
      if (qaChatHistory.length === 0) {
        initialMessage = language === 'pt-BR'
          ? "Bem-vindo à sessão de perguntas e respostas. Pode ativar o seu microfone e colocar a sua questão sempre que estiver pronto. Terei todo o gosto em ajudar, seja sobre a apresentação ou sobre outros fundos da BlueCrow."
          : "Welcome to the Q&A. You can turn on your microphone and ask your question whenever you’re ready. I’m happy to help with anything from the presentation, or with questions about other BlueCrow funds.";
        console.log('📝 Setting Q&A chat history to initial message (first time)');
        setQaChatHistory([{ sender: 'agent', text: initialMessage }]);
      } else {
        console.log('📝 Q&A mode - preserving existing chat history');
        // Don't speak when returning to Q&A with existing history
        shouldSpeak = false;
      }
      setQaSlide(allSlides.find(s => s.id === 'bluecrow_end') || allSlides[0] || null);
    }

    if (shouldSpeak) {
      speakText(initialMessage);
    } else {
      speechService.cancel();
      setParticipants(prev => prev.map(p => p.isAgent ? { ...p, isSpeaking: false } : p));
    }

    // Cleanup speech and timeouts on change
    return () => {
      speechService.cancel();
      setParticipants(prev => prev.map(p => p.isAgent ? { ...p, isSpeaking: false } : p));
      // Clear any pending auto-advance timeout
      if (autoAdvanceTimeoutRef.current) {
        clearTimeout(autoAdvanceTimeoutRef.current);
        autoAdvanceTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pitchSlideIndex, isPitchStarted, isInCall, allSlides]);

  const handleJoinCall = async (name: string, email: string, room: string, selectedLanguage: Language, selectedVoiceGender: VoiceGender) => {
    const normalizedRoom = room.trim().toUpperCase();

    const bundle = await loadContentBundle();
    const runtimeSlides = bundle.slides;
    const runtimeRoomConfigurations = bundle.roomConfigSet.configurations || [];
    const roomConfig = findRoomConfiguration(runtimeRoomConfigurations, normalizedRoom);

    // Keep app state synced with the active content source.
    setAllSlides(runtimeSlides);
    setRoomConfigurations(runtimeRoomConfigurations);
    setContentSource(bundle.source);

    if (!roomConfig) {
      alert(`Room "${normalizedRoom}" was not found in the ${bundle.source.toUpperCase()} content source.`);
      return;
    }

    const dynamicSlides = getSlidesByIds(roomConfig.slideSequence, runtimeSlides);
    if (dynamicSlides.length === 0) {
      alert(`Room "${normalizedRoom}" has no valid slides in the current content source.`);
      return;
    }

    setUserName(name);
    setUserEmail(email);
    setRoomId(normalizedRoom);
    setIsInCall(true);
    setLanguage(selectedLanguage);
    setVoiceGender(selectedVoiceGender);

    // Store email for future use (e.g., analytics, user tracking)
    console.log('User joined with email:', email);

    setActivePitchSlides(dynamicSlides);
    console.log(
      `[Room Config] Loaded ${dynamicSlides.length} slides for room ${normalizedRoom} from ${bundle.source.toUpperCase()}:`,
      roomConfig.name
    );

    // Reset pitch index to start from beginning
    setPitchSlideIndex(0);

    // Set the language for TTS service
    speechService.setLanguage(selectedLanguage);

    // Initialize participants with the agent and current user.
    setParticipants([
      { id: 'agent', name: 'BlueCrow Virtual Agent', isAgent: true, isSpeaking: false, videoSrc: AVATAR_VIDEO_URL },
      { id: 'user-1', name: name, isAgent: false, isSpeaking: false, videoSrc: '' }
    ]);

    // Agent becomes ready after a short delay (simulating connection)
    setTimeout(() => setIsAgentReady(true), 1000);
  };
  
  const handleLeaveCall = async () => {
    // Show confirmation modal instead of immediately leaving
    setShowResetModal(true);
  };

  const handleConfirmReset = async () => {
    // Hide the modal
    setShowResetModal(false);

    // Get room configuration data
    const roomConfig = findRoomConfiguration(roomConfigurations, roomId);

    // Prepare session data using shared helper
    const sessionData = prepareSessionData({
      userName,
      userEmail,
      roomId,
      roomIdComponents: roomConfig?.components,
      roomConfigName: roomConfig?.name,
      language,
      callDuration,
      pitchChatHistory,
      qaChatHistory,
    });

    // Log what we're sending for debugging
    console.log('📤 Sending session data to Logic App (Off button):', {
      userName,
      roomId,
      mode,
      qaChatHistoryLength: qaChatHistory.length,
      pitchChatHistoryLength: pitchChatHistory.length,
      hasQuestions: qaChatHistory.length > 0,
    });

    // Send session data to Azure Function App (non-blocking)
    sendSessionData(sessionData);

    // Now perform the hard reset
    wasInterruptedRef.current = true;

    // Stop all audio/speech services FIRST
    speechService.cancel();

    // Clear any pending auto-advance timeout
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    // Stop STT (Azure or Browser) via ChatPanel's cleanup function
    if (stopVoiceModeRef.current) {
      stopVoiceModeRef.current();
    }

    // Reset ALL state to initial values - this returns to lobby
    setIsInCall(false);
    setUserName('');
    setUserEmail('');
    setRoomId('');
    setParticipants([]);
    setPitchChatHistory([]);
    setQaChatHistory([]);
    setPitchSlideIndex(0);
    setQaSlide(allSlides.find(s => s.id === 'bluecrow_end') || allSlides[0] || null);
    setIsPitchStarted(false);
    setMode('pitch');
    setQaQueue([]);
    setIsAgentReady(false);
    setCallDuration(0);
    setIsChatVisible(false);
    setIsTtsEnabled(true);
    setIsTtsPaused(false);
    setIsMicMuted(false);
  };

  const handleCancelReset = () => {
    // Simply hide the modal and continue the call
    setShowResetModal(false);
  };

  const handleOpenBugReport = () => {
    // Remember if TTS was already paused before opening modal
    wasPausedBeforeModalRef.current = isTtsPaused;
    // Pause TTS if not already paused
    if (!isTtsPaused) {
      speechService.pause();
      setIsTtsPaused(true);
    }
    setShowBugReportModal(true);
  };

  const handleSubmitBugReport = async (bugDescription: string) => {
    try {
      await sendBugReport({
        userEmail,
        bugDescription,
        roomId,
        language,
        voiceGender,
      });
      console.log('Bug report submitted successfully');
    } catch (error) {
      console.error('Failed to submit bug report:', error);
    }
    setShowBugReportModal(false);
    // Resume TTS only if it wasn't paused before opening the modal
    if (!wasPausedBeforeModalRef.current) {
      speechService.resume();
      setIsTtsPaused(false);
    }
  };

  const handleCancelBugReport = () => {
    setShowBugReportModal(false);
    // Resume TTS only if it wasn't paused before opening the modal
    if (!wasPausedBeforeModalRef.current) {
      speechService.resume();
      setIsTtsPaused(false);
    }
  };

  const handleSetMode = (newMode: AppMode) => {
    wasInterruptedRef.current = true;
    if (mode === newMode) return;

    // Stop TTS
    speechService.cancel();

    // Clear any pending auto-advance timeout
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    // Stop STT when switching modes
    if (stopVoiceModeRef.current) {
      stopVoiceModeRef.current();
    }

    setIsPitchStarted(false); // Reset pitch state on any mode change
    setQaQueue([]); // Clear any pending questions
    setMode(newMode);

    // Start Q&A mode with chat hidden by default, hide in pitch mode
    if (newMode === 'qa') {
      setIsChatVisible(false); // Start with chat hidden in Q&A mode
      setQaSlide(allSlides.find(s => s.id === 'bluecrow_end') || allSlides[0] || null); // Start with bluecrow_end slide
    } else {
      setIsChatVisible(false);
    }
  };

  const handleStartPitch = () => {
    setIsPitchStarted(true);
  };

  const handleToggleTts = () => {
    if (!isTtsPaused) {
      // Mute: pause speech mid-sentence
      speechService.pause();
      setIsTtsPaused(true);
    } else {
      // Unmute
      setIsTtsPaused(false);
      if (slideSkippedWhileMutedRef.current) {
        // Slide was changed while muted — start the current slide from the beginning
        slideSkippedWhileMutedRef.current = false;
        if (isTtsEnabled && mode === 'pitch' && isPitchStarted) {
          const slide = activePitchSlides[pitchSlideIndex];
          const textToSpeak = slide?.pitchScript?.[language];
          if (textToSpeak) {
            wasInterruptedRef.current = false;
            currentSpeechIdRef.current += 1;
            const thisSpeechId = currentSpeechIdRef.current;
            speechService.speak(
              textToSpeak,
              () => {
                if (thisSpeechId !== currentSpeechIdRef.current) return;
                wasInterruptedRef.current = false;
                setParticipants((prev: Participant[]) => prev.map(p => p.isAgent ? { ...p, isSpeaking: true } : p));
              },
              () => {
                if (thisSpeechId !== currentSpeechIdRef.current) return;
                setParticipants((prev: Participant[]) => prev.map(p => p.isAgent ? { ...p, isSpeaking: false } : p));
                if (pitchSlideIndex < activePitchSlides.length - 1) {
                  autoAdvanceTimeoutRef.current = setTimeout(() => {
                    if (!wasInterruptedRef.current && thisSpeechId === currentSpeechIdRef.current) {
                      setPitchSlideIndex((prev: number) => prev + 1);
                    }
                    autoAdvanceTimeoutRef.current = null;
                  }, 500);
                }
              },
              1,
              language
            );
          }
        }
      } else {
        // No slide change — resume from where it was paused
        speechService.resume();
      }
    }
  };

  const handleToggleMic = () => {
    setIsMicMuted(prev => !prev);
  };

  const handleUserStartedSpeaking = useCallback(() => {
    // Interrupt the agent immediately when user starts speaking
    // Use setParticipants callback to get current state instead of closure
    setParticipants(prev => {
      const agentSpeaking = prev.find(p => p.isAgent)?.isSpeaking;
      console.log('🔴 handleUserStartedSpeaking called, agent speaking:', agentSpeaking);

      if (agentSpeaking) {
        console.log('🛑 Stopping agent speech NOW');
        wasInterruptedRef.current = true;
        speechService.cancel();
        console.log('✅ Speech cancelled and participants updated');
        // Return updated participants with agent not speaking
        return prev.map(p => p.isAgent ? { ...p, isSpeaking: false } : p);
      } else {
        console.log('⚠️ Agent not speaking, cannot interrupt');
        return prev; // No change
      }
    });
  }, []);

  const handleSendMessage = useCallback((message: string) => {
    if (mode !== 'qa') return;

    // Add user message to Q&A chat history immediately for responsiveness
    setQaChatHistory(prev => [...prev, { sender: 'user', text: message }]);

    // Add the question to the processing queue
    setQaQueue(prev => [...prev, message]);

  }, [mode]);

  // Effect to process the QA queue
  useEffect(() => {
    if (isLoading || qaQueue.length === 0 || mode !== 'qa') {
      return;
    }

    const processQueue = async () => {
      const nextQuestion = qaQueue[0];
      setIsLoading(true);
      wasInterruptedRef.current = true;
      speechService.cancel();

      try {
        // Filter slides: only include those with QnA=true explicitly set
        const qnaSlides = allSlides.filter(slide => slide.QnA === true);
        const slidesManifest = JSON.stringify(qnaSlides.map(({ id, description }) => ({ id, description })));
        // Use Azure Search for dynamic knowledge base (no fallback)
        // Pass Q&A conversation history (last 10 messages before the current question)
        const result = await getQaAnswer(nextQuestion, null, slidesManifest, true, language, qaChatHistory);

        const relevantSlide = allSlides.find(s => s.id === result.slideId) || qaSlide;
        setQaSlide(relevantSlide);

        // Strip markdown for TTS and send to speech first
        const cleanTextForTTS = stripMarkdownForTTS(result.answer);
        console.log('🔊 Original answer:', result.answer);
        console.log('🔊 Cleaned for TTS:', cleanTextForTTS);
        speakText(cleanTextForTTS);

        // Then add to Q&A chat history with original markdown formatting
        const agentResponse: ChatMessage = { sender: 'agent', text: result.answer };
        setQaChatHistory(prev => [...prev, agentResponse]);

      } catch (error) {
        console.error("Error processing queue item:", error);
        const errorMessage = error instanceof Error ? error.message : "Sorry, I encountered an error. Please try again.";
        const errorText = `Error: ${errorMessage}`;

        // Strip markdown for TTS and send to speech first
        const cleanTextForTTS = stripMarkdownForTTS(errorText);
        speakText(cleanTextForTTS);

        // Then add to Q&A chat history
        const agentErrorMessage: ChatMessage = { sender: 'agent', text: errorText };
        setQaChatHistory(prev => [...prev, agentErrorMessage]);
      } finally {
        setQaQueue(prev => prev.slice(1)); // Dequeue
        setIsLoading(false);
      }
    };

    processQueue();

  }, [qaQueue, isLoading, mode, speakText, qaSlide, allSlides]);


  const handleNextSlide = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();

    // Cancel any pending auto-advance timeout
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    // Set interrupted flag BEFORE canceling to prevent auto-advance from cancel callback
    wasInterruptedRef.current = true;

    // Track if slide was skipped while muted so unmute knows to start fresh
    if (isTtsPaused) slideSkippedWhileMutedRef.current = true;

    // Stop current speech
    speechService.cancel();
    setParticipants(prev => prev.map(p => p.isAgent ? { ...p, isSpeaking: false } : p));

    // Move to next slide (with bounds check to prevent going past end)
    setPitchSlideIndex((prev) => {
      const nextIndex = prev + 1;
      if (nextIndex >= activePitchSlides.length) {
        // Already at last slide, don't advance
        return prev;
      }
      return nextIndex;
    });

    // Note: The effect will trigger speakText for the new slide,
    // and auto-advance will resume after that speech completes
  };

  const handlePrevSlide = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();

    // Cancel any pending auto-advance timeout
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    // Set interrupted flag BEFORE canceling to prevent auto-advance from cancel callback
    wasInterruptedRef.current = true;

    // Track if slide was skipped while muted so unmute knows to start fresh
    if (isTtsPaused) slideSkippedWhileMutedRef.current = true;

    // Stop current speech
    speechService.cancel();
    setParticipants(prev => prev.map(p => p.isAgent ? { ...p, isSpeaking: false } : p));

    // Move to previous slide (with bounds check to prevent going before start)
    setPitchSlideIndex((prev) => {
      const prevIndex = prev - 1;
      if (prevIndex < 0) {
        // Already at first slide, don't go back
        return prev;
      }
      return prevIndex;
    });

    // Note: The effect will trigger speakText for the new slide,
    // and auto-advance will resume after that speech completes
  };
  
  const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');

    if (h !== '00') {
        return `${h}:${m}:${s}`;
    }
    return `${m}:${s}`;
  };

  const handleAdminContentRefresh = async () => {
    const bundle = await loadContentBundle(true);
    setAllSlides(bundle.slides);
    setRoomConfigurations(bundle.roomConfigSet.configurations || []);
    setContentSource(bundle.source);
    console.log(
      `[Content] Refreshed after admin publish from ${bundle.source.toUpperCase()}`
    );
  };

  const currentSlide = mode === 'pitch' ? activePitchSlides[pitchSlideIndex] : qaSlide;

  if (!isInCall) {
    return (
      <Lobby
        onJoin={handleJoinCall}
        roomConfigurations={roomConfigurations}
        contentSource={contentSource}
        onContentRefresh={handleAdminContentRefresh}
      />
    );
  }

  return (
    <>
      <ConfirmResetModal
        isOpen={showResetModal}
        onConfirm={handleConfirmReset}
        onCancel={handleCancelReset}
      />
      <BugReportModal
        isOpen={showBugReportModal}
        onSubmit={handleSubmitBugReport}
        onCancel={handleCancelBugReport}
        language={language}
      />
      <div className={`min-h-screen flex flex-col font-sans ${isDarkTheme ? 'bg-[#0c0f1d]' : 'bg-slate-100'}`}>
        <header className={`p-4 border-b shadow-lg backdrop-blur-sm relative z-50 ${isDarkTheme ? 'border-slate-700/50 bg-slate-900/50' : 'border-slate-200 bg-white/80'}`}>
        <div className="container mx-auto flex justify-between items-center relative">
          <div className="flex items-center gap-3">
            <img src={isDarkTheme ? '/icon_BCC_white.png' : '/icon_BCC.png'} alt="Blue Crow Capital" className="w-8 h-8" />
            <h1 className={`text-xl md:text-2xl font-bold ${isDarkTheme ? 'text-slate-100' : 'text-slate-900'}`}>BlueCrow</h1>
            <span className={`hidden md:inline-block text-sm font-medium ml-2 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>Room: {roomId}</span>
            <div className={`hidden md:flex items-center gap-2 text-sm font-medium border-l pl-4 ml-2 ${isDarkTheme ? 'border-slate-700' : 'border-slate-200'}`}>
              {isAgentReady ? (
                mode === 'qa' ? (
                  <span className="flex items-center gap-2 text-green-400">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                    Live Agent Active
                  </span>
                ) : (
                  <span className={`flex items-center gap-2 ${isDarkTheme ? 'text-yellow-400' : 'text-blue-400'}`}>
                    <span className="relative flex h-3 w-3">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isDarkTheme ? 'bg-yellow-400' : 'bg-blue-400'} opacity-75`}></span>
                      <span className={`relative inline-flex rounded-full h-3 w-3 ${isDarkTheme ? 'bg-yellow-500' : 'bg-blue-500'}`}></span>
                    </span>
                    Pitch in Progress
                  </span>
                )
              ) : (
                <span className="text-amber-400">Connecting...</span>
              )}
            </div>
            <div className={`hidden md:flex items-center gap-2 text-sm font-medium border-l pl-4 ml-2 ${isDarkTheme ? 'text-slate-400 border-slate-700' : 'text-slate-500 border-slate-200'}`}>
              <ClockIcon className="w-4 h-4" />
              <span>{formatDuration(callDuration)}</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center ${isDarkTheme ? 'bg-[#3B4252]' : 'bg-[#878f9a]'} rounded-full p-1 border border-slate-700`}>
              <button
                onClick={() => setIsDarkTheme(false)}
                className={`px-3 py-1 text-sm font-semibold rounded-full transition-colors duration-200 flex items-center gap-1.5 ${
                  !isDarkTheme ? 'bg-blue-600 text-white' : (isDarkTheme ? 'bg-[#3B4252] text-white' : 'bg-[#878f9a] text-white')
                }`}
                aria-label="Switch to light theme"
              >
                <SunIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsDarkTheme(true)}
                className={`px-3 py-1 text-sm font-semibold rounded-full transition-colors duration-200 flex items-center gap-1.5 ${
                  isDarkTheme ? 'bg-blue-600 text-white' : 'bg-[#878f9a] text-white'
                }`}
                aria-label="Switch to dark theme"
              >
                <MoonIcon className="w-4 h-4" />
              </button>
            </div>
             <button onClick={handleToggleTts} className={`p-2 transition-colors ${isDarkTheme ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`} aria-label={isTtsPaused ? 'Resume Agent Speech' : 'Pause Agent Speech'}>
              {isTtsPaused ? <SpeakerOffIcon className="w-6 h-6" /> : <SpeakerOnIcon className="w-6 h-6" />}
            </button>
            <ModeSelector currentMode={mode} onSetMode={handleSetMode} isQnaEnabled={isQnaEnabled} isDarkTheme={isDarkTheme} />
            <button
                onClick={handleLeaveCall}
                className="p-2 bg-red-600 text-white rounded-full hover:bg-red-500 transition-colors"
                aria-label="End Call"
              >
                <EndCallIcon className="w-6 h-6" />
            </button>
            <LanguageSwitch isDarkTheme={isDarkTheme} />
          </div>
        </div>
      </header>
      
      <main className="flex-1 container mx-auto p-4 flex flex-col h-full overflow-hidden">
        <div className="flex-1 flex flex-col lg:flex-row gap-4 overflow-hidden relative min-h-0">
            <div className={`w-full ${isChatVisible ? 'lg:flex-[2]' : 'lg:flex-1'} flex flex-col gap-4 relative min-h-0 overflow-hidden transition-all duration-300`}>
            {/* Show listening indicator above slides when in Q&A mode */}
            {mode === 'qa' && (
              <ListeningIndicator
                input={sttInput}
                isListening={isListening}
                isMicMuted={isMicMuted}
                onToggleMic={handleToggleMic}
                isDarkTheme={isDarkTheme}
              />
            )}
            <SlideViewer
                slide={currentSlide}
                onNext={mode === 'pitch' && isPitchStarted ? handleNextSlide : undefined}
                onPrev={mode === 'pitch' && isPitchStarted ? handlePrevSlide : undefined}
                isPitchMode={mode === 'pitch'}
                pitchProgress={isPitchStarted ? (pitchSlideIndex + 1) / activePitchSlides.length * 100 : 0}
                allPitchSlides={mode === 'pitch' ? activePitchSlides : []}
                className="flex-1 min-h-0"
            />
            {mode === 'pitch' && !isPitchStarted && (
              <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl z-10 animate-fade-in">
                  <h2 className="text-3xl font-bold mb-4 text-slate-100">Presentation Ready</h2>
                  <p className="text-slate-300 mb-8">The agent is ready to begin the pitch.</p>
                  <button
                      onClick={handleStartPitch}
                      className="bg-blue-600 text-white font-bold py-3 px-8 rounded-full text-lg hover:bg-blue-500 transition-transform transform hover:scale-105 shadow-lg"
                  >
                      Start Pitch
                  </button>
              </div>
            )}
            </div>

            {/* Chat Panel - Rendered in both modes, visibility controlled */}
            <div className={`flex-1 lg:flex-[1] flex-col min-h-0 transition-all duration-300 ${isChatVisible ? 'flex' : 'hidden'}`}>
              <ChatPanel
                  chatHistory={mode === 'pitch' ? pitchChatHistory : qaChatHistory}
                  onSendMessage={handleSendMessage}
                  isLoading={isLoading}
                  isQaMode={mode === 'qa'}
                  isMicMuted={isMicMuted}
                  isAgentSpeaking={participants.find(p => p.isAgent)?.isSpeaking || false}
                  onUserStartedSpeaking={handleUserStartedSpeaking}
                  onStopVoiceModeRef={stopVoiceModeRef}
                  onInputChange={setSttInput}
                  onListeningChange={setIsListening}
                  isDarkTheme={isDarkTheme}
              />
            </div>
            {/* Floating Bug Report Button */}
            {isBugReportEnabled && (
              <button
                onClick={handleOpenBugReport}
                className="fixed bottom-44 right-6 p-4 rounded-full shadow-lg transition-all duration-300 z-50 bg-yellow-500 hover:bg-yellow-400 text-white"
                aria-label="Report a Bug"
                title={language === 'pt-BR' ? 'Reportar um Problema' : 'Report a Bug'}
              >
                <BugReportIcon className="w-6 h-6" />
              </button>
            )}

            {/* Floating Consent Settings Button - always visible */}
            <button
              onClick={() => setIsConsentModalOpen(true)}
              className="fixed bottom-24 right-6 p-4 rounded-full shadow-lg transition-all duration-300 z-50 bg-slate-700 hover:bg-slate-600 text-slate-200"
              aria-label="Consent Settings"
            >
              <ShieldIcon className="w-6 h-6" />
            </button>

            {/* Floating Toggle Button */}
            <button
              onClick={() => setIsChatVisible(!isChatVisible)}
              className={`fixed bottom-6 right-6 p-4 rounded-full shadow-lg transition-all duration-300 z-50 ${
                isChatVisible
                  ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
              aria-label={isChatVisible ? 'Hide chat' : 'Show chat'}
            >
              {isChatVisible ? (
                <CloseIcon className="w-6 h-6" />
              ) : (
                <ChatIcon className="w-6 h-6" />
              )}
            </button>
        </div>
        <ComplianceBanner
          language={language}
          isDarkTheme={isDarkTheme}
          showBanner={mode === 'qa'}
          openConsentModal={isConsentModalOpen}
          onConsentModalClose={() => setIsConsentModalOpen(false)}
        />
      </main>
      </div>
    </>
  );
};

export default App;

