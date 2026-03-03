import React, { useState, useEffect } from 'react';
import type { Language } from '../types';
import { getLegalContent } from '../config/legalContent';
import type { ConsentPreferences } from '../services/consentService';
import { getDefaultPreferences } from '../services/consentService';

interface ConsentModalProps {
  language: Language;
  isOpen: boolean;
  onClose?: () => void;
  onSave: (preferences: ConsentPreferences) => void;
  onAcceptAll?: () => void;
  onRejectNonEssential?: () => void;
  onOpenPrivacyPolicy: () => void;
  initialPreferences?: ConsentPreferences;
}

const ShieldIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const ConsentModal: React.FC<ConsentModalProps> = ({
  language,
  isOpen,
  onClose,
  onSave,
  onAcceptAll,
  onRejectNonEssential,
  onOpenPrivacyPolicy,
  initialPreferences,
}) => {
  const content = getLegalContent(language).consent;
  const [showCustomize, setShowCustomize] = useState(false);
  const [preferences, setPreferences] = useState<ConsentPreferences>(
    initialPreferences || getDefaultPreferences()
  );

  // Sync preferences and reset view only when the modal opens
  useEffect(() => {
    if (isOpen) {
      setPreferences(initialPreferences || getDefaultPreferences());
      setShowCustomize(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggle = (key: keyof ConsentPreferences) => {
    if (key === 'essential' || key === 'interactionProcessing' || key === 'aiTransparency') return;
    setPreferences((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAcceptAll = () => {
    if (onAcceptAll) {
      onAcceptAll();
    } else {
      onSave({
        essential: true,
        interactionProcessing: true,
        aiTransparency: true,
        sessionAnalytics: true,
        conversationData: true,
        bugReportData: true,
      });
    }
  };

  const handleRejectNonEssential = () => {
    if (onRejectNonEssential) {
      onRejectNonEssential();
    } else {
      onSave({
        essential: true,
        interactionProcessing: true,
        aiTransparency: true,
        sessionAnalytics: false,
        conversationData: false,
        bugReportData: false,
      });
    }
  };

  const categories: { key: keyof ConsentPreferences; required: boolean; icon: string }[] = [
    { key: 'essential',             required: true,  icon: '🔒' },
    { key: 'interactionProcessing', required: true,  icon: '🎙️' },
    { key: 'aiTransparency',        required: true,  icon: '🤖' },
    { key: 'sessionAnalytics',      required: false, icon: '📊' },
    { key: 'conversationData',      required: false, icon: '💬' },
    { key: 'bugReportData',         required: false, icon: '🛠️' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal — glassmorphism card */}
      <div className="relative w-full max-w-md bg-white/5 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/10 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400">
                <ShieldIcon />
              </span>
              <h2 className="text-lg font-semibold text-white">
                {content.modalTitle}
              </h2>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1 text-white/40 hover:text-white/80 transition-colors mt-0.5"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <p className="mt-3 text-sm text-white/60 leading-relaxed">
            {content.modalDescription}
          </p>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/8 mx-6" />

        {/* Customize section — collapsible */}
        {showCustomize && (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {categories.map(({ key, required, icon }) => (
              <div
                key={key}
                className="flex items-start justify-between gap-4 p-3.5 rounded-xl bg-white/5 border border-white/8 hover:bg-white/8 transition-colors"
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="text-base mt-0.5 shrink-0">{icon}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium text-white">
                        {content.categories[key].title}
                      </span>
                      {required && (
                        <span className="text-xs text-blue-400/90 font-medium bg-blue-500/15 px-1.5 py-0.5 rounded-full">
                          {content.required}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-white/50 leading-relaxed">
                      {content.categories[key].description}
                    </p>
                  </div>
                </div>

                {/* Toggle */}
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    checked={preferences[key]}
                    onChange={() => handleToggle(key)}
                    disabled={required}
                    className="sr-only peer"
                  />
                  <div
                    className={`w-10 h-5 rounded-full transition-colors duration-200 ${
                      required
                        ? 'bg-blue-600 cursor-not-allowed'
                        : preferences[key]
                        ? 'bg-blue-600'
                        : 'bg-white/15'
                    } after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all ${
                      preferences[key] ? 'after:translate-x-5' : ''
                    }`}
                  />
                </label>
              </div>
            ))}

            <div className="pt-1 pb-1">
              <button
                onClick={onOpenPrivacyPolicy}
                className="text-xs text-blue-400/80 hover:text-blue-300 underline underline-offset-2"
              >
                {content.privacyPolicyLink}
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 pb-6 pt-4 space-y-3">

          {/* Privacy policy link — only when not in customize mode */}
          {!showCustomize && (
            <div className="text-center">
              <button
                onClick={onOpenPrivacyPolicy}
                className="text-xs text-white/40 hover:text-white/70 underline underline-offset-2 transition-colors"
              >
                {content.privacyPolicyLink}
              </button>
            </div>
          )}

          {/* Primary action buttons */}
          <div className="flex gap-2.5">
            <button
              onClick={handleRejectNonEssential}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white/80 bg-white/8 border border-white/12 rounded-xl hover:bg-white/14 hover:text-white transition-all duration-200"
            >
              {content.rejectNonEssential}
            </button>
            <button
              onClick={handleAcceptAll}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-500 active:scale-95 transition-all duration-200 shadow-lg shadow-blue-900/30"
            >
              {content.acceptAll}
            </button>
          </div>

          {/* Manage / Save */}
          {!showCustomize ? (
            <button
              onClick={() => setShowCustomize(true)}
              className="w-full py-2 text-xs font-medium text-white/35 hover:text-white/60 transition-colors duration-200 text-center"
            >
              {content.managePreferences}
            </button>
          ) : (
            <button
              onClick={() => onSave(preferences)}
              className="w-full px-4 py-2.5 text-sm font-medium text-white bg-white/10 border border-white/12 rounded-xl hover:bg-white/16 transition-all duration-200"
            >
              {content.savePreferences}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConsentModal;
