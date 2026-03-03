import React, { useState, useEffect } from 'react';
import type { Language } from '../types';
import { getConsent, type ConsentPreferences } from '../services/consentService';
import ConsentModal from './ConsentModal';
import PrivacyPolicy from './PrivacyPolicy';
import { setConsent } from '../services/consentService';

interface ComplianceBannerProps {
  language: Language;
  isDarkTheme?: boolean;
  openConsentModal?: boolean;
  onConsentModalClose?: () => void;
  showBanner?: boolean;
}


const ComplianceBanner: React.FC<ComplianceBannerProps> = ({ language, isDarkTheme = true, openConsentModal = false, onConsentModalClose, showBanner = true }) => {
  const [showConsentModal, setShowConsentModal] = useState(false);

  useEffect(() => {
    if (openConsentModal) {
      setShowConsentModal(true);
    }
  }, [openConsentModal]);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [, forceUpdate] = useState({});

  // Localized text
  const texts = {
    'en-US': {
      aiDisclosure: 'You are interacting with the BlueCrow AI Agent. Responses are AI-generated.',
      privacyPolicy: 'Privacy Policy',
      consentSettings: 'Consent Settings',
      consentStatus: {
        all: 'All permissions granted',
        essential: 'Essential only',
        partial: 'Some permissions granted',
      },
    },
    'en-UK': {
      aiDisclosure: 'You are interacting with the BlueCrow AI Agent. Responses are AI-generated.',
      privacyPolicy: 'Privacy Policy',
      consentSettings: 'Consent Settings',
      consentStatus: {
        all: 'All permissions granted',
        essential: 'Essential only',
        partial: 'Some permissions granted',
      },
    },
    'pt-BR': {
      aiDisclosure: 'Voce esta interagindo com o Agente de IA BlueCrow. Respostas geradas por IA.',
      privacyPolicy: 'Politica de Privacidade',
      consentSettings: 'Config. de Consentimento',
      consentStatus: {
        all: 'Todas permissoes concedidas',
        essential: 'Apenas essenciais',
        partial: 'Algumas permissoes concedidas',
      },
    },
  };

  const t = texts[language] || texts['en-US'];

  const handleCloseConsentModal = () => {
    setShowConsentModal(false);
    onConsentModalClose?.();
  };

  const handleSavePreferences = (preferences: ConsentPreferences) => {
    setConsent(preferences);
    handleCloseConsentModal();
    forceUpdate({}); // Force re-render to update consent status
  };

  return (
    <>
      {showBanner && (
        <div className={`w-full max-w-5xl mx-auto mt-4 pt-3 border-t ${isDarkTheme ? 'border-slate-200/20' : 'border-slate-300'}`}>
          <div className={`flex items-center justify-between gap-4 text-sm px-2 ${isDarkTheme ? 'text-slate-500' : 'text-slate-600'}`}>
            {/* Compact AI Disclosure (inline) */}
            <div className="flex-1 min-w-0">
              <p className="truncate">{t.aiDisclosure} <span className={`underline ml-1 cursor-pointer ${isDarkTheme ? 'text-blue-500 hover:text-blue-400' : 'text-blue-700 hover:text-blue-600'}`} onClick={() => setShowPrivacyPolicy(true)}>{t.privacyPolicy}</span></p>
            </div>
          </div>
        </div>
      )}

      {/* Consent Modal */}
      <ConsentModal
        language={language}
        isOpen={showConsentModal}
        onClose={handleCloseConsentModal}
        onSave={handleSavePreferences}
        onOpenPrivacyPolicy={() => {
          setShowConsentModal(false);
          setShowPrivacyPolicy(true);
        }}
        initialPreferences={getConsent()?.preferences}
      />

      {/* Privacy Policy Modal */}
      <PrivacyPolicy
        language={language}
        isOpen={showPrivacyPolicy}
        onClose={() => setShowPrivacyPolicy(false)}
      />
    </>
  );
};

export default ComplianceBanner;
