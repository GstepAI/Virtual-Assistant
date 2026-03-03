/**
 * Consent Service
 * Manages user consent state for GDPR compliance
 * Version: 1.0.0
 */

export const CONSENT_VERSION = '1.0.0';
const CONSENT_STORAGE_KEY = 'bluecrow_consent';

export interface ConsentPreferences {
  essential: boolean;              // Always true, required for service
  interactionProcessing: boolean;  // Voice/text processing via Azure AI (EU servers)
  sessionAnalytics: boolean;       // Call duration, timestamps, etc.
  conversationData: boolean;       // Chat history, voice transcripts storage
  bugReportData: boolean;          // Browser info, bug descriptions
  aiTransparency: boolean;         // EU AI Act Article 50 - user acknowledges AI interaction
}

export interface ConsentState {
  version: string;
  timestamp: string;
  preferences: ConsentPreferences;
  acknowledged: boolean;     // User has seen and acknowledged the consent
}

const DEFAULT_PREFERENCES: ConsentPreferences = {
  essential: true,
  interactionProcessing: true,  // Required for app to function (voice/text features)
  sessionAnalytics: false,
  conversationData: false,
  bugReportData: false,
  aiTransparency: true,         // Required - EU AI Act Article 50 disclosure
};

/**
 * Get current consent state from localStorage
 */
export const getConsent = (): ConsentState | null => {
  try {
    const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!stored) return null;

    const consent = JSON.parse(stored) as ConsentState;

    // Check if consent version is current
    if (consent.version !== CONSENT_VERSION) {
      // Old consent version - needs re-consent
      return null;
    }

    return consent;
  } catch (error) {
    console.error('Error reading consent from localStorage:', error);
    return null;
  }
};

/**
 * Check if user has given valid consent
 */
export const hasValidConsent = (): boolean => {
  const consent = getConsent();
  return consent !== null && consent.acknowledged;
};

/**
 * Check if user has consented to a specific data category
 */
export const hasConsentFor = (category: keyof ConsentPreferences): boolean => {
  const consent = getConsent();
  if (!consent || !consent.acknowledged) return false;
  return consent.preferences[category] ?? false;
};

/**
 * Save consent preferences
 */
export const setConsent = (preferences: ConsentPreferences): ConsentState => {
  const consentState: ConsentState = {
    version: CONSENT_VERSION,
    timestamp: new Date().toISOString(),
    preferences: {
      ...preferences,
      essential: true, // Always required
    },
    acknowledged: true,
  };

  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consentState));
  } catch (error) {
    console.error('Error saving consent to localStorage:', error);
  }

  return consentState;
};

/**
 * Accept all consent options
 */
export const acceptAllConsent = (): ConsentState => {
  return setConsent({
    essential: true,
    interactionProcessing: true,
    sessionAnalytics: true,
    conversationData: true,
    bugReportData: true,
    aiTransparency: true,
  });
};

/**
 * Accept only essential consent (minimum required for app to function)
 * Note: interactionProcessing is always true as it's required for core functionality
 */
export const acceptEssentialOnly = (): ConsentState => {
  return setConsent({
    essential: true,
    interactionProcessing: true,  // Required for app to function
    sessionAnalytics: false,
    conversationData: false,
    bugReportData: false,
    aiTransparency: true,         // Required - EU AI Act Article 50
  });
};

/**
 * Revoke consent and clear stored data
 */
export const revokeConsent = (): void => {
  try {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch (error) {
    console.error('Error revoking consent:', error);
  }
};

/**
 * Get consent timestamp for audit purposes
 */
export const getConsentTimestamp = (): string | null => {
  const consent = getConsent();
  return consent?.timestamp ?? null;
};

/**
 * Get consent data for inclusion in session data
 */
export const getConsentForSession = (): {
  consentVersion: string;
  consentTimestamp: string | null;
  consentPreferences: ConsentPreferences | null;
} => {
  const consent = getConsent();
  return {
    consentVersion: CONSENT_VERSION,
    consentTimestamp: consent?.timestamp ?? null,
    consentPreferences: consent?.preferences ?? null,
  };
};

/**
 * Get default preferences (for UI initialization)
 */
export const getDefaultPreferences = (): ConsentPreferences => {
  return { ...DEFAULT_PREFERENCES };
};

/**
 * Check if user has consented to interaction processing (voice/text via Azure AI)
 * This is required for microphone and text input features to work
 */
export const canProcessInteractions = (): boolean => {
  return hasConsentFor('interactionProcessing');
};
