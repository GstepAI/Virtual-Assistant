import type { ChatMessage, Language } from '../types';
import type { RoomIdComponents } from '../types/roomConfig';
import { getConsentForSession, hasConsentFor, type ConsentPreferences } from './consentService';
import { getRuntimeConfig, getCachedConfig } from '../hooks/useRuntimeConfig';

export interface SessionData {
  userName: string;
  userEmail: string;
  roomId: string;
  roomIdComponents?: RoomIdComponents; // Structured room ID components
  roomConfigName?: string;             // Human-readable configuration name
  language: Language;
  callDuration?: number;                // Only sent if sessionAnalytics consent given
  pitchChatHistory?: ChatMessage[];     // Only sent if conversationData consent given
  qaChatHistory?: ChatMessage[];        // Only sent if conversationData consent given
  chatHistory?: ChatMessage[];          // Only sent if conversationData consent given
  timestamp: string;
  // GDPR Consent tracking
  consentVersion: string;
  consentTimestamp: string | null;
  consentPreferences: ConsentPreferences | null;
}

/**
 * Prepares session data payload with all required fields
 * Helper function to ensure consistency between different session end scenarios
 * GDPR: Only includes data categories the user has consented to
 */
export const prepareSessionData = (params: {
  userName: string;
  userEmail: string;
  roomId: string;
  roomIdComponents?: RoomIdComponents;
  roomConfigName?: string;
  language: Language;
  callDuration: number;
  pitchChatHistory: ChatMessage[];
  qaChatHistory: ChatMessage[];
}): SessionData => {
  // Get consent data for GDPR compliance
  const consentData = getConsentForSession();
  const prefs = consentData.consentPreferences;

  // Prepare chat history - if Q&A is empty, send a descriptive message for AI summarization
  // Only include if user consented to conversationData
  const chatHistoryToSend = params.qaChatHistory.length > 0
    ? params.qaChatHistory
    : [{
        sender: 'agent' as const,
        text: 'No conversation history available. The client did not engage in Q&A or ask any questions during this session. There is nothing to summarize.'
      }];

  return {
    // Essential data - always sent (required for service)
    userName: params.userName,
    userEmail: params.userEmail,
    roomId: params.roomId,
    roomIdComponents: params.roomIdComponents,
    roomConfigName: params.roomConfigName,
    language: params.language,
    timestamp: new Date().toISOString(),

    // Session Analytics - only if consented
    callDuration: prefs?.sessionAnalytics ? params.callDuration : undefined,

    // Conversation Data - only if consented
    pitchChatHistory: prefs?.conversationData ? params.pitchChatHistory : undefined,
    qaChatHistory: prefs?.conversationData ? params.qaChatHistory : undefined,
    chatHistory: prefs?.conversationData ? chatHistoryToSend : undefined,

    // GDPR Consent tracking - always included for audit
    consentVersion: consentData.consentVersion,
    consentTimestamp: consentData.consentTimestamp,
    consentPreferences: consentData.consentPreferences,
  };
};

/**
 * Sends session data to Azure Function App
 * @param sessionData The session data to send
 * @returns Promise that resolves when data is sent successfully
 */
export const sendSessionData = async (sessionData: SessionData): Promise<void> => {
  const { sessionDataEndpoint: FUNCTION_APP_URL } = await getRuntimeConfig();

  try {
    console.log('Sending session data to Azure Function App:', sessionData);

    const response = await fetch(FUNCTION_APP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sessionData),
    });

    if (!response.ok) {
      throw new Error(`Failed to send session data: ${response.status} ${response.statusText}`);
    }

    console.log('Session data sent successfully');
  } catch (error) {
    console.error('Error sending session data:', error);
    // Don't throw - we don't want to prevent the reset if the upload fails
    // You can add additional error handling here if needed
  }
};

/**
 * In-memory guard to prevent duplicate session end requests
 */
const sessionEndedSet = new Set<string>();

/**
 * Sends session data on page unload using navigator.sendBeacon for reliability
 * This function is optimized for page unload scenarios (tab close, refresh, navigation)
 * @param sessionData The session data to send
 * @returns boolean indicating if the beacon was queued successfully
 */
export const endSessionOnUnload = (sessionData: SessionData): boolean => {
  const FUNCTION_APP_URL = getCachedConfig()?.sessionDataEndpoint ?? '';

  console.log('🔍 [DEBUG] endSessionOnUnload called');
  console.log('🔍 [DEBUG] Endpoint URL:', FUNCTION_APP_URL);

  // Create unique session key for deduplication (use roomId + userEmail, NOT timestamp)
  // Timestamp changes each time, so we key by session identity instead
  const sessionKey = `${sessionData.roomId}-${sessionData.userEmail}`;
  console.log('🔍 [DEBUG] Session key:', sessionKey);

  // Check in-memory guard first
  console.log('🔍 [DEBUG] Checking in-memory guard...');
  console.log('🔍 [DEBUG] sessionEndedSet contains:', Array.from(sessionEndedSet));
  if (sessionEndedSet.has(sessionKey)) {
    console.log('⚠️ Session end already sent for this session (in-memory check), skipping');
    return false;
  }
  console.log('✅ [DEBUG] In-memory guard passed');

  // Check localStorage guard (persists across quick reloads)
  const storageKey = `session-ended-${sessionData.roomId}`;
  console.log('🔍 [DEBUG] Checking localStorage guard with key:', storageKey);
  try {
    const alreadySent = localStorage.getItem(storageKey);
    console.log('🔍 [DEBUG] localStorage value:', alreadySent);
    const now = Date.now();
    if (alreadySent) {
      const sentTime = parseInt(alreadySent, 10);
      const timeSince = now - sentTime;
      console.log('🔍 [DEBUG] Time since last send:', timeSince, 'ms (', Math.floor(timeSince / 1000), 'seconds)');
      // Only block if sent within last 5 minutes (300000ms)
      if (now - sentTime < 90000) {
        console.log('⚠️ Session end already sent recently (localStorage check), skipping');
        console.log('⚠️ [DEBUG] Will allow retry in:', 90000 - timeSince, 'ms');
        return false;
      }
    }
    console.log('✅ [DEBUG] localStorage guard passed');
  } catch (e) {
    // Ignore localStorage errors (e.g., private browsing mode)
    console.warn('Could not access localStorage for session guard:', e);
  }

  try {
    console.log('📤 Sending session data on unload:', {
      userName: sessionData.userName,
      roomId: sessionData.roomId,
      callDuration: sessionData.callDuration,
      timestamp: sessionData.timestamp,
      endpoint: FUNCTION_APP_URL,
    });

    // Mark as sent in both guards BEFORE sending
    sessionEndedSet.add(sessionKey);
    try {
      localStorage.setItem(storageKey, Date.now().toString());
      // Auto-cleanup after 5 minutes
      setTimeout(() => {
        try {
          localStorage.removeItem(storageKey);
        } catch (e) {
          // Ignore errors on cleanup
        }
      }, 300000);
    } catch (e) {
      // Ignore localStorage errors
    }

    // Primary: Try fetch with keepalive (non-blocking, best for performance)
    try {
      const payload = JSON.stringify(sessionData);
      console.log('📊 Payload size:', payload.length, 'bytes');

      // Attempt 1: fetch with keepalive
      fetch(FUNCTION_APP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: payload,
        keepalive: true,
      }).then(() => {
        console.log('✅ fetch with keepalive completed successfully');
      }).catch((error) => {
        console.error('❌ fetch with keepalive failed:', error);
      });

      // Fallback: Use sendBeacon as backup (more reliable during unload)
      const blob = new Blob([payload], { type: 'application/json' });
      const beaconQueued = navigator.sendBeacon(FUNCTION_APP_URL, blob);
      console.log(beaconQueued ? '✅ sendBeacon queued as backup' : '❌ sendBeacon failed to queue');

      return true;
    } catch (error) {
      console.error('❌ Error in endSessionOnUnload:', error);

      // Last resort: Synchronous XMLHttpRequest (blocks page unload until complete)
      // This is deprecated but most reliable for critical unload requests
      try {
        console.log('⚠️ Attempting synchronous XHR as last resort...');
        const xhr = new XMLHttpRequest();
        xhr.open('POST', FUNCTION_APP_URL, false); // false = synchronous
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(JSON.stringify(sessionData));
        console.log('✅ Synchronous XHR completed with status:', xhr.status);
        return xhr.status >= 200 && xhr.status < 300;
      } catch (xhrError) {
        console.error('❌ Synchronous XHR also failed:', xhrError);
        return false;
      }
    }
  } catch (error) {
    console.error('❌ Error in endSessionOnUnload:', error);
    return false;
  }
};
