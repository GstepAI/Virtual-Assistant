/**
 * Audio Utilities for Web Audio API
 * Provides audio processing functions for real-time voice interaction with Azure services
 */

/**
 * Encode Uint8Array to base64 string
 */
export function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Calculate RMS (Root Mean Square) volume level
 * Used for voice activity detection
 * @param audioData Audio data as Float32Array
 * @returns RMS value (0 to 1)
 */
export function calculateRMS(audioData: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < audioData.length; i++) {
    sum += audioData[i] * audioData[i];
  }
  return Math.sqrt(sum / audioData.length);
}

/**
 * Simple voice activity detection based on volume threshold
 * @param audioData Audio data as Float32Array
 * @param threshold Volume threshold (0 to 1, default 0.01)
 * @returns true if voice is detected
 */
export function detectVoiceActivity(audioData: Float32Array, threshold: number = 0.01): boolean {
  const rms = calculateRMS(audioData);
  return rms > threshold;
}

