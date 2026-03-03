import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Language, VoiceGender } from '../types';
import type { RoomConfiguration } from '../types/roomConfig';
import { formatRoomId } from '../utils/roomIdValidator';
import { roomConfigService } from '../services/roomConfigService';
import { getRoomConfiguration } from '../services/contentDataService';
import ConsentModal from './ConsentModal';
import PrivacyPolicy from './PrivacyPolicy';
import AdminPanel from './AdminPanel';
import { useRuntimeConfig } from '../hooks/useRuntimeConfig';
import {
  hasValidConsent,
  acceptAllConsent,
  acceptEssentialOnly,
  setConsent,
  getConsent,
  type ConsentPreferences,
} from '../services/consentService';

interface LobbyProps {
  onJoin: (
    name: string,
    email: string,
    room: string,
    language: Language,
    voiceGender: VoiceGender
  ) => void;
  roomConfigurations?: RoomConfiguration[];
  contentSource?: 'api' | 'local';
  onContentRefresh?: () => void | Promise<void>;
}

// Voice names mapping for each language
const VOICE_OPTIONS: Record<Language, { male: string; female: string }> = {
  'en-US': {
    male: 'Andrew',
    female: 'Emma',
  },
  'en-UK': {
    male: 'Arthur',
    female: 'Sophie',
  },
  'pt-BR': {
    male: 'Duarte',
    female: 'Raquel',
  },
};

function findRoomConfiguration(
  configurations: RoomConfiguration[],
  roomId: string
): RoomConfiguration | null {
  const normalized = roomId.trim().toUpperCase();
  return (
    configurations.find((configuration) => configuration.roomId === normalized) || null
  );
}

const Lobby: React.FC<LobbyProps> = ({
  onJoin,
  roomConfigurations,
  contentSource = 'local',
  onContentRefresh,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [room, setRoom] = useState('');
  const [roomError, setRoomError] = useState('');
  const [language, setLanguage] = useState<Language>('en-US');
  const [voiceGender, setVoiceGender] = useState<VoiceGender>('female');
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const { adminEnabled } = useRuntimeConfig();
  const [isCheckingRoom, setIsCheckingRoom] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const effectiveRoomConfigurations = useMemo(
    () =>
      roomConfigurations && roomConfigurations.length > 0
        ? roomConfigurations
        : roomConfigService.getAllConfigurations(),
    [roomConfigurations]
  );

  // Consent state
  const needsConsent = !hasValidConsent();
  const [showConsentModal, setShowConsentModal] = useState(needsConsent);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [hasConsented, setHasConsented] = useState(!needsConsent);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = 0.75;
    }
  }, []);

  // Consent handlers
  const handleAcceptAll = () => {
    acceptAllConsent();
    setShowConsentModal(false);
    setHasConsented(true);
  };

  const handleRejectNonEssential = () => {
    acceptEssentialOnly();
    setShowConsentModal(false);
    setHasConsented(true);
  };

  const handleSavePreferences = (preferences: ConsentPreferences) => {
    setConsent(preferences);
    setShowConsentModal(false);
    setHasConsented(true);
  };

  const handleOpenPrivacyPolicy = () => {
    setShowPrivacyPolicy(true);
  };

  // Email validation function using regex
  const validateEmail = (value: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  };

  // Handle email change with validation
  const handleEmailChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setEmail(value);

    // Only show error if user has typed something
    if (value.trim() === '') {
      setEmailError('');
    } else if (!validateEmail(value)) {
      setEmailError('Please enter a valid email address');
    } else {
      setEmailError('');
    }
  };

  const FORMAT_REGEX = /^BC-[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/;

  // Looks up room locally, then falls back to a live API fetch if not found
  const resolveRoomConfig = async (formatted: string) => {
    const local = findRoomConfiguration(effectiveRoomConfigurations, formatted);
    if (local) return local;

    // Not in local cache — fetch fresh from the API
    return await getRoomConfiguration(formatted, true);
  };

  // Handle room ID change with validation
  const handleRoomChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setRoom(value);

    if (value.trim() === '') {
      setRoomError('');
      return;
    }

    const formatted = formatRoomId(value);

    if (!FORMAT_REGEX.test(formatted)) {
      setRoomError('Invalid room ID format. Expected: BC-XXX-XXX-XXX');
      return;
    }

    setIsCheckingRoom(true);
    const config = await resolveRoomConfig(formatted);
    setIsCheckingRoom(false);

    if (!config) {
      setRoomError('Room ID not found');
      return;
    }

    // If found via live fetch, refresh parent so App state is up to date
    if (!findRoomConfiguration(effectiveRoomConfigurations, formatted) && onContentRefresh) {
      onContentRefresh();
    }

    setRoomError('');
    if (config.defaultLanguage && config.defaultLanguage !== language) {
      setLanguage(config.defaultLanguage);
    }
  };

  const handleJoin = async (event: React.FormEvent) => {
    event.preventDefault();

    // Check consent first
    if (!hasConsented) {
      setShowConsentModal(true);
      return;
    }

    // Final validation before submission
    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    const formatted = formatRoomId(room);
    if (!FORMAT_REGEX.test(formatted)) {
      setRoomError('Invalid room ID format. Expected: BC-XXX-XXX-XXX');
      return;
    }

    setIsCheckingRoom(true);
    const config = await resolveRoomConfig(formatted);
    setIsCheckingRoom(false);

    if (!config) {
      setRoomError('Room ID not found');
      return;
    }

    if (name.trim() && email.trim() && room.trim()) {
      onJoin(name.trim(), email.trim(), formatted, language, voiceGender);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 font-sans relative overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        className="absolute top-0 left-0 w-full h-full object-cover z-0"
      >
        <source src="/Bluecrow Beacj.mp4" type="video/mp4" />
      </video>

      {/* Discreet admin entry point on the lobby side */}
      {adminEnabled && (
        <button
          type="button"
          onClick={() => setShowAdminPanel(true)}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-20 rounded-l-lg px-2 py-1.5 bg-slate-900/70 border border-slate-700 border-r-0 text-[10px] tracking-wider uppercase text-slate-300 hover:bg-slate-800/80"
          aria-label="Open admin console"
          title="Admin"
        >
          Admin
        </button>
      )}

      <div className="w-full max-w-md bg-slate-800/50 rounded-2xl shadow-2xl p-8 border border-slate-700 backdrop-blur-lg relative z-10">
        <div className="flex flex-col items-center mb-6">
          <img src="/icon_BCC_white.png" alt="Blue Crow Capital" className="w-12 h-12 mb-3" />
          <h1 className="text-2xl font-bold text-slate-100">Blue Crow Capital</h1>
          <p className="text-slate-400">Join a Presentation Room</p>
        </div>

        <form onSubmit={handleJoin} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
              Your Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g., Jane Doe"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={handleEmailChange}
              placeholder="e.g., jane.doe@example.com"
              className={`w-full bg-slate-700 border rounded-lg px-4 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 ${
                emailError
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-slate-600 focus:ring-blue-500'
              }`}
              required
            />
            {emailError && <p className="mt-1 text-sm text-red-400">{emailError}</p>}
          </div>

          <div>
            <label htmlFor="room" className="block text-sm font-medium text-slate-300 mb-2">
              Room ID
            </label>
            <input
              id="room"
              type="text"
              value={room}
              onChange={handleRoomChange}
              placeholder="e.g., BC-XXX-XXX-XXX"
              className={`w-full bg-slate-700 border rounded-lg px-4 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 ${
                roomError
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-slate-600 focus:ring-blue-500'
              }`}
              required
              maxLength={14}
            />
            {roomError && <p className="mt-1 text-sm text-red-400">{roomError}</p>}
            {isCheckingRoom && <p className="mt-1 text-sm text-slate-400">Checking room...</p>}
            {!roomError && !isCheckingRoom && room.trim() && (
              <p className="mt-1 text-sm text-green-400">Valid room ID</p>
            )}
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-4">
            <div>
              <label htmlFor="language" className="block text-sm font-medium text-slate-300 mb-2">
                Presentation Language
              </label>
              <select
                id="language"
                value={language}
                onChange={(event) => setLanguage(event.target.value as Language)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="en-US">English (US)</option>
                <option value="en-UK">English (UK)</option>
                <option value="pt-BR">Portuguese (BR)</option>
              </select>
            </div>
            <div>
              <label htmlFor="voiceGender" className="block text-sm font-medium text-slate-300 mb-2">
                Voice
              </label>
              <select
                id="voiceGender"
                value={voiceGender}
                onChange={(event) => setVoiceGender(event.target.value as VoiceGender)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[120px]"
              >
                <option value="female">{VOICE_OPTIONS[language].female}</option>
                <option value="male">{VOICE_OPTIONS[language].male}</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={!name.trim() || !email.trim() || !room.trim() || !!emailError || !!roomError || !hasConsented || isCheckingRoom}
            className="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors duration-200"
          >
            Join Call
          </button>

          <div className="text-center mt-4">
            <button
              type="button"
              onClick={handleOpenPrivacyPolicy}
              className="text-sm text-blue-400 hover:text-blue-300 underline"
            >
              Privacy Policy
            </button>
            {!hasConsented && (
              <p className="text-xs text-amber-400 mt-2">
                Please accept our privacy policy to continue
              </p>
            )}
          </div>
        </form>
      </div>

      <ConsentModal
        language={language}
        isOpen={showConsentModal}
        onClose={hasConsented ? () => setShowConsentModal(false) : undefined}
        onSave={handleSavePreferences}
        onAcceptAll={handleAcceptAll}
        onRejectNonEssential={handleRejectNonEssential}
        onOpenPrivacyPolicy={handleOpenPrivacyPolicy}
        initialPreferences={getConsent()?.preferences}
      />

      <PrivacyPolicy
        language={language}
        isOpen={showPrivacyPolicy}
        onClose={() => setShowPrivacyPolicy(false)}
      />

      <AdminPanel
        isOpen={showAdminPanel}
        onClose={() => setShowAdminPanel(false)}
        onContentUpdated={onContentRefresh}
      />
    </div>
  );
};

export default Lobby;
