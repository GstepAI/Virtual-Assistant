import React from 'react';
import type { Language } from '../types';
import { getLegalContent } from '../config/legalContent';

interface ConsentBannerProps {
  language: Language;
  onAcceptAll: () => void;
  onManagePreferences: () => void;
  onRejectNonEssential: () => void;
  onOpenPrivacyPolicy: () => void;
}

const ConsentBanner: React.FC<ConsentBannerProps> = ({
  language,
  onAcceptAll,
  onManagePreferences,
  onRejectNonEssential,
  onOpenPrivacyPolicy,
}) => {
  const content = getLegalContent(language).consent;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-slate-900/95 border-t border-slate-700 backdrop-blur-lg shadow-2xl">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-100 mb-1">
              {content.bannerTitle}
            </h3>
            <p className="text-sm text-slate-300">
              {content.bannerText}{' '}
              <button
                onClick={onOpenPrivacyPolicy}
                className="text-blue-400 hover:text-blue-300 underline"
              >
                {content.privacyPolicyLink}
              </button>
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={onRejectNonEssential}
              className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 border border-slate-600 rounded-lg hover:bg-slate-600 transition-colors duration-200"
            >
              {content.rejectNonEssential}
            </button>
            <button
              onClick={onManagePreferences}
              className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 border border-slate-600 rounded-lg hover:bg-slate-600 transition-colors duration-200"
            >
              {content.managePreferences}
            </button>
            <button
              onClick={onAcceptAll}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors duration-200"
            >
              {content.acceptAll}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConsentBanner;
