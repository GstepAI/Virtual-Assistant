import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage } from '../types';
import { LoadingSpinnerIcon, BotIcon, UserIcon } from './icons';
import * as audioUtils from '../services/audioUtils';
import { AzureSTTService } from '../services/sttService';
import { useLanguage } from '../contexts/LanguageContext';
import { canProcessInteractions } from '../services/consentService';

/**
 * Format text with markdown-like syntax
 * Supports: **bold**, numbered lists, bullet points
 */
const formatMessage = (text: string): React.ReactNode[] => {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, lineIndex) => {
    // Skip empty lines
    if (line.trim() === '') {
      elements.push(<br key={`br-${lineIndex}`} />);
      return;
    }

    // Remove **bold** markers (both paired and unpaired) and ## headers
    let cleanLine = line.replace(/\*\*(.*?)\*\*/g, '$1'); // Remove paired **bold**
    cleanLine = cleanLine.replace(/\*\*/g, ''); // Remove any remaining unpaired **
    cleanLine = cleanLine.replace(/^#+\s*/, ''); // Remove markdown headers (##, ###, etc.)

    // Check if line is a numbered list (1. , 2. , etc.)
    const numberedMatch = cleanLine.match(/^(\d+)\.\s+(.+)$/);
    if (numberedMatch) {
      elements.push(
        <div key={`line-${lineIndex}`} className="flex gap-2 ml-2 my-1">
          <span className="text-blue-400 font-medium flex-shrink-0">{numberedMatch[1]}.</span>
          <span>{numberedMatch[2]}</span>
        </div>
      );
      return;
    }

    // Check if line is a bullet point (- or •)
    const bulletMatch = cleanLine.match(/^[-•]\s+(.+)$/);
    if (bulletMatch) {
      elements.push(
        <div key={`line-${lineIndex}`} className="flex gap-2 ml-2 my-1">
          <span className="text-blue-400 flex-shrink-0">•</span>
          <span>{bulletMatch[1]}</span>
        </div>
      );
      return;
    }

    // Regular line
    elements.push(
      <div key={`line-${lineIndex}`} className="my-1">
        {cleanLine}
      </div>
    );
  });

  return elements;
};

// Feature flag to toggle between browser STT and Azure STT
const USE_AZURE_STT = true; // Set to false to use browser's Web Speech API

// Web Speech API interfaces for cross-browser compatibility (fallback)
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface ChatPanelProps {
  chatHistory: ChatMessage[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  isQaMode: boolean;
  isMicMuted?: boolean;
  isAgentSpeaking?: boolean;
  onUserStartedSpeaking?: () => void; // Callback when user starts speaking (for interruption)
  onStopVoiceModeRef?: React.RefObject<(() => void) | null>; // Expose cleanup function to parent
  onInputChange?: (input: string) => void; // Callback to notify parent of input changes
  onListeningChange?: (isListening: boolean) => void; // Callback to notify parent of listening state changes
  isDarkTheme?: boolean; // Theme prop for styling
}

const ChatPanel: React.FC<ChatPanelProps> = ({ chatHistory, onSendMessage, isLoading, isQaMode, isMicMuted = false, isAgentSpeaking = false, onUserStartedSpeaking, onStopVoiceModeRef, onInputChange, onListeningChange, isDarkTheme = true }) => {
  const { language } = useLanguage();
  const [input, setInput] = useState('');
  const [hasInteractionConsent, setHasInteractionConsent] = useState(canProcessInteractions());

  // Check consent periodically (in case user updates it)
  useEffect(() => {
    const checkConsent = () => setHasInteractionConsent(canProcessInteractions());
    checkConsent();
    const interval = setInterval(checkConsent, 2000);
    return () => clearInterval(interval);
  }, []);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null); // Browser STT fallback
  const azureSTTRef = useRef<AzureSTTService | null>(null); // Azure STT service
  const isPausedForAgentRef = useRef(false); // Track if we're paused because agent is speaking
  const prevLanguageRef = useRef(language); // Track previous language to detect actual changes

  // Voice activity detection refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isSpeakingRef = useRef(false);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastInputRef = useRef('');
  const isAgentSpeakingRef = useRef(false); // Track agent speaking state for VAD closure

  // Smart scroll container refs
  const outerDivRef = useRef<HTMLDivElement>(null);
  const innerDivRef = useRef<HTMLDivElement>(null);
  const prevInnerDivHeight = useRef<number | null>(null);

  // Auto-scroll logic - always scroll to bottom on new messages
  useEffect(() => {
    if (!outerDivRef.current || !innerDivRef.current) return;

    const outerDivHeight = outerDivRef.current.clientHeight;
    const innerDivHeight = innerDivRef.current.clientHeight;

    outerDivRef.current.scrollTo({
      top: innerDivHeight - outerDivHeight,
      left: 0,
      behavior: prevInnerDivHeight.current ? "smooth" : "auto"
    });

    prevInnerDivHeight.current = innerDivHeight;
  }, [chatHistory, isLoading]);


  const stopVoiceMode = useCallback(() => {
    if (USE_AZURE_STT) {
      // Stop Azure STT
      if (azureSTTRef.current) {
        azureSTTRef.current.stop();
        azureSTTRef.current = null;
      }
    } else {
      // Stop browser speech recognition
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }

      // Stop audio monitoring
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop());
        micStreamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    }

    isSpeakingRef.current = false;
    setIsListening(false);
  }, []);

  const startAzureSTT = useCallback(() => {
    // Prevent creating duplicate instances
    if (azureSTTRef.current) {
      console.warn('Azure STT already running, stopping previous instance');
      azureSTTRef.current.stop();
      azureSTTRef.current = null;
    }

    setIsListening(true);

    const sttService = new AzureSTTService({
      language,
      onInterimResult: (text: string) => {
        // Show interim results in the text box
        console.log('Azure STT interim:', text);
        setInput(text);
        lastInputRef.current = text;

        // Trigger interruption if agent is speaking
        if (isPausedForAgentRef.current && onUserStartedSpeaking) {
          console.log('⚡ User interrupted agent via Azure STT');
          onUserStartedSpeaking();
          // Allow processing again after interrupt
          isPausedForAgentRef.current = false;
        }
      },
      onFinalResult: (text: string) => {
        console.log('Azure STT final result:', text);
        const trimmedText = text.trim();
        if (trimmedText) {
          // Send message immediately
          onSendMessage(trimmedText);
          setInput('');
          lastInputRef.current = '';
        }
      },
      onError: (error: string) => {
        console.error('Azure STT error:', error);
        alert(`Speech recognition error: ${error}`);
        stopVoiceMode();
      },
      onStart: () => {
        console.log('Azure STT started');
      },
      onEnd: () => {
        console.log('Azure STT ended');
      }
    });

    azureSTTRef.current = sttService;
    sttService.start();
  }, [language, onSendMessage, stopVoiceMode, onUserStartedSpeaking]);

  const startBrowserSTT = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Sorry, your browser does not support speech recognition.");
      return;
    }

    setIsListening(true);

    // Start speech recognition
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onstart = () => {
      console.log('Speech recognition started');
    };

    recognition.onend = () => {
      console.log('Speech recognition ended, restarting...');
      // Auto-restart if still in listening mode AND not paused for agent
      if (recognitionRef.current && !isPausedForAgentRef.current) {
        try {
          setTimeout(() => {
            if (recognitionRef.current && !isPausedForAgentRef.current) {
              recognitionRef.current.start();
            }
          }, 100);
        } catch (e) {
          console.error('Failed to restart recognition:', e);
        }
      }
    };

    recognition.onresult = (event: any) => {
      // Ignore results if agent is speaking (extra safeguard)
      if (isPausedForAgentRef.current) {
        console.log('Ignoring recognition result - agent is speaking');
        return;
      }

      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setInput(prevInput => {
          const trimmedPrev = prevInput.trim();
          const trimmedNew = finalTranscript.trim();
          const newInput = trimmedPrev ? trimmedPrev + ' ' + trimmedNew : trimmedNew;
          lastInputRef.current = newInput; // Store for auto-send
          return newInput;
        });
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        console.error('Speech recognition error:', event.error);
        alert('Microphone access denied. Please enable microphone permissions in your browser settings.');
        stopVoiceMode();
      } else if (event.error === 'aborted') {
        // Ignore aborted errors during restart
        console.log('Recognition aborted, will restart');
      } else if (event.error === 'no-speech') {
        // Ignore no-speech errors, just keep listening
        console.log('No speech detected, continuing to listen');
      } else {
        console.error('Speech recognition error:', event.error);
      }
    };

    recognition.start();
    recognitionRef.current = recognition;

    // Setup audio monitoring for voice activity detection
    setupAudioMonitoring();
  }, [language, stopVoiceMode, onSendMessage]);

  const setupAudioMonitoring = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      micStreamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const SILENCE_THRESHOLD = 0.015;
      const INTERRUPT_THRESHOLD = 0.02; // Threshold for interrupt - low enough for user voice, high enough to filter echo
      const SILENCE_DURATION = 750; // 1 seconds of silence before auto-send

      const monitorAudio = () => {
        if (!analyserRef.current) return;

        const dataArray = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(dataArray);

        const rms = audioUtils.calculateRMS(dataArray);
        const isVoiceActive = audioUtils.detectVoiceActivity(dataArray, SILENCE_THRESHOLD);

        // Log audio levels periodically (every 30 frames = ~500ms at 60fps)
        if (Math.random() < 0.033) {
          console.log('VAD: RMS=', rms.toFixed(4), 'isVoiceActive=', isVoiceActive, 'isAgentSpeaking=', isAgentSpeakingRef.current);
        }

        if (isVoiceActive) {
          // User is speaking
          if (!isSpeakingRef.current) {
            isSpeakingRef.current = true;
            console.log('🎤 Started speaking, RMS:', rms.toFixed(4), 'isAgentSpeaking:', isAgentSpeakingRef.current, 'onUserStartedSpeaking:', !!onUserStartedSpeaking);

            // Trigger interrupt callback if agent is speaking AND RMS is high enough
            // Use higher threshold to avoid triggering on bot's echo
            if (isAgentSpeakingRef.current && onUserStartedSpeaking && rms > INTERRUPT_THRESHOLD) {
              console.log('⚡ User interrupted agent - calling interrupt callback (RMS above threshold)');
              onUserStartedSpeaking();
            } else if (isAgentSpeakingRef.current && rms <= INTERRUPT_THRESHOLD) {
              console.log('🔇 Audio detected but RMS too low for interrupt (likely bot echo)');
            } else {
              console.log('⏸️ Not interrupting - agent not speaking or no callback');
            }
          }
          // Clear silence timer since user is still speaking
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        } else {
          // No voice detected
          if (isSpeakingRef.current && !silenceTimerRef.current) {
            // User stopped speaking, start silence timer
            console.log('Stopped speaking, waiting for silence...');
            silenceTimerRef.current = setTimeout(() => {
              // Get the current input value
              const currentInput = lastInputRef.current.trim();
              console.log('Silence detected, sending message:', currentInput);

              if (currentInput) {
                onSendMessage(currentInput);
                setInput('');
                lastInputRef.current = '';
              }
              isSpeakingRef.current = false;
              silenceTimerRef.current = null;
            }, SILENCE_DURATION);
          }
        }

        animationFrameRef.current = requestAnimationFrame(monitorAudio);
      };

      monitorAudio();
    } catch (error) {
      console.error('Error setting up audio monitoring:', error);
      alert('Could not access microphone. Please check your permissions.');
      stopVoiceMode();
    }
  };

  const handleToggleListen = useCallback(() => {
    if (isListening) {
      stopVoiceMode();
    } else {
      // Double-check we're not already running (prevents race conditions)
      if (USE_AZURE_STT && azureSTTRef.current) {
        console.warn('Azure STT already active, skipping start');
        return;
      }
      if (!USE_AZURE_STT && recognitionRef.current) {
        console.warn('Browser STT already active, skipping start');
        return;
      }

      if (USE_AZURE_STT) {
        // Use Azure STT
        startAzureSTT();
      } else {
        // Use browser's Web Speech API
        startBrowserSTT();
      }
    }
  }, [isListening, language, stopVoiceMode, startAzureSTT, startBrowserSTT]);

  // Auto-start listening when entering Q&A mode, stop when exiting
  useEffect(() => {
    if (isQaMode && !isListening && !isLoading) {
      // Automatically start listening when Q&A mode is activated (only if not muted)
      if (!isMicMuted) {
        handleToggleListen();
      }
    } else if (!isQaMode && isListening) {
      // Stop listening when exiting Q&A mode
      stopVoiceMode();
    }
  }, [isQaMode, isListening, isLoading, handleToggleListen, stopVoiceMode]);

  // Handle microphone mute/unmute from parent
  useEffect(() => {
    if (isMicMuted && isListening) {
      // Mute: stop listening
      stopVoiceMode();
    } else if (!isMicMuted && !isListening && isQaMode) {
      // Unmute: restart listening in Q&A mode
      handleToggleListen();
    }
  }, [isMicMuted, isListening, stopVoiceMode, handleToggleListen, isQaMode]);

  // Pause speech recognition when agent is speaking to prevent feedback loop
  // Note: For Azure STT with VAD, we just set the flag to ignore results during agent speech
  // For browser STT, VAD continues monitoring even while paused, allowing for instant interruption
  useEffect(() => {
    // Only run this effect in Q&A mode
    if (!isQaMode) {
      return;
    }

    // Update ref so VAD monitoring loop can access current value
    isAgentSpeakingRef.current = isAgentSpeaking;
    console.log('isAgentSpeaking changed:', isAgentSpeaking, 'azureSTT:', !!azureSTTRef.current, 'browserSTT:', !!recognitionRef.current, 'isListening:', isListening);

    if (USE_AZURE_STT) {
      // For Azure STT, track agent speaking state but don't block recognition
      // This allows interim results to trigger interruptions
      if (isAgentSpeaking) {
        isPausedForAgentRef.current = true;
        console.log('Agent started speaking - Azure STT continues listening for interrupts');
      } else {
        isPausedForAgentRef.current = false;
        console.log('Agent finished speaking - Azure STT resuming normal processing');
      }
    } else {
      // Browser STT handling
      if (isAgentSpeaking && recognitionRef.current) {
        // Set flag to prevent auto-restart
        isPausedForAgentRef.current = true;
        console.log('Agent started speaking - pausing browser recognition');
        // Temporarily stop recognition while agent speaks
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.log('Error stopping recognition during agent speech:', e);
        }
      } else if (!isAgentSpeaking && isListening && isPausedForAgentRef.current) {
        // Agent finished speaking - resume recognition
        isPausedForAgentRef.current = false;
        console.log('Agent finished speaking - resuming browser recognition');
        // Resume recognition after agent finishes speaking
        setTimeout(() => {
          if (recognitionRef.current && !isPausedForAgentRef.current) {
            try {
              recognitionRef.current.start();
              console.log('Browser recognition resumed successfully');
            } catch (e) {
              console.log('Browser recognition already running or error restarting:', e);
            }
          }
        }, 200); // Small delay to ensure audio has finished playing
      }
    }
  }, [isAgentSpeaking, isListening, isQaMode]);

  // Expose stopVoiceMode to parent component
  useEffect(() => {
    if (onStopVoiceModeRef) {
      onStopVoiceModeRef.current = stopVoiceMode;
    }
  }, [stopVoiceMode, onStopVoiceModeRef]);

  // Notify parent of listening state changes
  useEffect(() => {
    if (onListeningChange) {
      onListeningChange(isListening);
    }
  }, [isListening, onListeningChange]);

  // Notify parent of input changes
  useEffect(() => {
    if (onInputChange) {
      onInputChange(input);
    }
  }, [input, onInputChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVoiceMode();
    };
  }, [stopVoiceMode]);

  // Restart STT when language changes while actively listening
  useEffect(() => {
    // Check if language actually changed (not just initial mount or re-render)
    const languageChanged = prevLanguageRef.current !== language;

    // Update the ref for next comparison
    prevLanguageRef.current = language;

    // Only restart if language actually changed AND we're actively listening
    if (!languageChanged || !isListening) return;

    console.log('🌐 Language changed while listening, restarting STT with new language:', language);

    // Stop current STT
    stopVoiceMode();

    // Brief delay to ensure cleanup completes
    const timeoutId = setTimeout(() => {
      // Restart with new language
      if (USE_AZURE_STT) {
        startAzureSTT();
      } else {
        startBrowserSTT();
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [language, isListening, stopVoiceMode, startAzureSTT, startBrowserSTT]);

  return (
    <div className={`rounded-xl shadow-2xl flex flex-col h-full border overflow-hidden ${
      isDarkTheme ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-100 border-slate-300'
    }`}>
      <div className={`p-4 border-b flex justify-between items-center ${
        isDarkTheme ? 'border-slate-700' : 'border-slate-300'
      }`}>
        <h3 className={`text-lg font-semibold ${isDarkTheme ? 'text-slate-200' : 'text-slate-900'}`}>
          {isQaMode ? 'Live Q&A' : 'Presentation Script'}
        </h3>
        {isQaMode && isListening && (
          <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded-full border border-red-500/50 animate-pulse flex items-center gap-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            REC
          </span>
        )}
      </div>

      <div className="flex-1 relative">
        <div
          ref={outerDivRef}
          className="absolute inset-0 p-4 overflow-y-auto scroll-smooth chat-messages-container"
        >
          <div ref={innerDivRef} className="space-y-4">
            {chatHistory.map((msg, index) => (
              <div key={index} className={`flex items-start gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.sender === 'agent' && (
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isDarkTheme ? 'bg-blue-500' : 'bg-[#2596be]'}`}>
                    <BotIcon className="w-5 h-5 text-white"/>
                  </div>
                )}
                <div className={`max-w-xs md:max-w-md px-4 py-3 rounded-2xl ${msg.sender === 'user' ? isDarkTheme ? 'bg-blue-600 text-white rounded-br-none' : 'bg-[#2596be] text-white rounded-br-none' : isDarkTheme ? 'bg-slate-700 text-slate-200 rounded-bl-none' : 'bg-[#868f9a] text-white rounded-bl-none'}`}>
                  <div className="text-sm leading-relaxed">
                    {formatMessage(msg.text)}
                  </div>
                </div>
                {msg.sender === 'user' && (
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isDarkTheme ? 'bg-[#2596be]' : 'bg-[#868f9a]'}`}>
                    <UserIcon className="w-5 h-5 text-white"/>
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#2596be] flex items-center justify-center flex-shrink-0">
                  <BotIcon className="w-5 h-5 text-white"/>
                </div>
                <div className={`px-4 py-3 rounded-2xl rounded-bl-none flex items-center gap-2 ${isDarkTheme ? 'bg-slate-700' : 'bg-[#868f9a]'}`}>
                  <LoadingSpinnerIcon className="w-5 h-5 text-slate-300" />
                  <span className="text-white text-sm">Thinking...</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* GDPR: Show message when interaction processing is not consented */}
      {isQaMode && !hasInteractionConsent && (
        <div className="p-3 border-t border-slate-700 bg-amber-900/30">
          <div className="flex items-center gap-2 text-amber-300 text-sm">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Voice and text features are disabled. Please accept "Voice & Text Processing" in privacy settings to enable Q&A.</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPanel;
