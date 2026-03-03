import type { Language, VoiceGender } from '../types';
import { hasConsentFor } from './consentService';
import { getRuntimeConfig } from '../hooks/useRuntimeConfig';

export interface BugReportData {
  userEmail: string;
  timestamp: string;
  websiteUrl: string;
  userBrowser: string;
  bugDescription: string;
  roomId: string;
  language: Language;
  voiceGender: VoiceGender;
}

/**
 * Gets browser information for bug reports
 */
const getBrowserInfo = (): string => {
  const userAgent = navigator.userAgent;
  let browserName = 'Unknown';
  let browserVersion = '';

  if (userAgent.includes('Firefox/')) {
    browserName = 'Firefox';
    browserVersion = userAgent.match(/Firefox\/(\d+(\.\d+)?)/)?.[1] || '';
  } else if (userAgent.includes('Edg/')) {
    browserName = 'Edge';
    browserVersion = userAgent.match(/Edg\/(\d+(\.\d+)?)/)?.[1] || '';
  } else if (userAgent.includes('Chrome/')) {
    browserName = 'Chrome';
    browserVersion = userAgent.match(/Chrome\/(\d+(\.\d+)?)/)?.[1] || '';
  } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) {
    browserName = 'Safari';
    browserVersion = userAgent.match(/Version\/(\d+(\.\d+)?)/)?.[1] || '';
  }

  return `${browserName} ${browserVersion}`.trim();
};

/**
 * Check if user has consented to bug report data collection
 * @returns boolean indicating if bug reports are allowed
 */
export const canSendBugReport = (): boolean => {
  return hasConsentFor('bugReportData');
};

/**
 * Sends bug report to Azure Function App
 * GDPR: Only sends if user has consented to bugReportData
 * @param bugReportData The bug report data to send
 * @returns Promise that resolves when data is sent successfully
 * @throws Error if user has not consented to bug report data collection
 */
export const sendBugReport = async (bugReportData: Omit<BugReportData, 'timestamp' | 'websiteUrl' | 'userBrowser'>): Promise<void> => {
  // Check consent before sending
  if (!hasConsentFor('bugReportData')) {
    console.warn('Bug report not sent: user has not consented to bugReportData collection');
    throw new Error('Bug report data collection not consented');
  }

  const { bugReportEndpoint: FUNCTION_APP_URL } = await getRuntimeConfig();

  const fullBugReportData: BugReportData = {
    ...bugReportData,
    timestamp: new Date().toISOString(),
    websiteUrl: window.location.href,
    userBrowser: getBrowserInfo(),
  };

  try {
    console.log('Sending bug report to Azure Function App:', fullBugReportData);

    const response = await fetch(FUNCTION_APP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fullBugReportData),
    });

    if (!response.ok) {
      throw new Error(`Failed to send bug report: ${response.status} ${response.statusText}`);
    }

    console.log('Bug report sent successfully');
  } catch (error) {
    console.error('Error sending bug report:', error);
    throw error; // Re-throw so caller can handle the error
  }
};
