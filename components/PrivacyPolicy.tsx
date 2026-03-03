import React from 'react';
import type { Language } from '../types';
import { getLegalContent } from '../config/legalContent';
import { CONSENT_VERSION } from '../services/consentService';

interface PrivacyPolicyProps {
  language: Language;
  isOpen: boolean;
  onClose: () => void;
}

const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ language, isOpen, onClose }) => {
  const content = getLegalContent(language).privacyPolicy;
  const sections = content.sections;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />

      {/* Modal — glassmorphism */}
      <div className="relative w-full max-w-2xl bg-white/5 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/10 max-h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-white">
                {content.title}
              </h1>
              <p className="mt-1 text-xs text-white/40">
                {content.lastUpdated}: January 2026 &nbsp;·&nbsp; Version {CONSENT_VERSION}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-white/40 hover:text-white/80 transition-colors mt-0.5 shrink-0"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/8 mx-6 shrink-0" />

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          <Section title={sections.introduction.title}>
            <p className="text-sm text-white/60 leading-relaxed">{sections.introduction.content}</p>
          </Section>

          <Section title={sections.dataController.title}>
            <p className="text-sm text-white/60 leading-relaxed">{sections.dataController.content}</p>
          </Section>

          <Section title={sections.dataCollected.title}>
            <p className="text-sm text-white/60 leading-relaxed">{sections.dataCollected.content}</p>
          </Section>

          <Section title={sections.purposes.title}>
            <p className="text-sm text-white/60 mb-3">{sections.purposes.content}</p>
            <ul className="space-y-1.5">
              {sections.purposes.list.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-white/60">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-blue-400/70 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </Section>

          <Section title={sections.thirdParties.title}>
            <p className="text-sm text-white/60 mb-3">{sections.thirdParties.content}</p>
            <div className="overflow-x-auto rounded-xl border border-white/8">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-white/6">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-white/50 uppercase tracking-wide">Provider</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-white/50 uppercase tracking-wide">Purpose</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-white/50 uppercase tracking-wide">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {sections.thirdParties.providers.map((provider, i) => (
                    <tr key={i} className="hover:bg-white/4 transition-colors">
                      <td className="px-4 py-3 text-sm text-white/70">{provider.name}</td>
                      <td className="px-4 py-3 text-sm text-white/60">{provider.purpose}</td>
                      <td className="px-4 py-3 text-sm text-white/60">{provider.location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={sections.dataRetention.title}>
            <p className="text-sm text-white/60 leading-relaxed">{sections.dataRetention.content}</p>
          </Section>

          <Section title={sections.yourRights.title}>
            <p className="text-sm text-white/60 mb-3">{sections.yourRights.content}</p>
            <ul className="space-y-1.5">
              {sections.yourRights.rights.map((right, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-white/60">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-blue-400/70 shrink-0" />
                  {right}
                </li>
              ))}
            </ul>
          </Section>

          <Section title={sections.exerciseRights.title}>
            <p className="text-sm text-white/60 leading-relaxed">{sections.exerciseRights.content}</p>
          </Section>

          <Section title={sections.cookies.title}>
            <p className="text-sm text-white/60 leading-relaxed">{sections.cookies.content}</p>
          </Section>

          <Section title={sections.changes.title}>
            <p className="text-sm text-white/60 leading-relaxed">{sections.changes.content}</p>
          </Section>

          <Section title={sections.contact.title}>
            <p className="text-sm text-white/60 leading-relaxed whitespace-pre-line">{sections.contact.content}</p>
          </Section>

        </div>

        {/* Divider */}
        <div className="h-px bg-white/8 mx-6 shrink-0" />

        {/* Footer */}
        <div className="px-6 py-4 shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 text-sm font-medium text-blue-300 bg-blue-500/15 border border-blue-500/25 rounded-xl hover:bg-blue-500/25 hover:text-blue-200 active:scale-95 transition-all duration-200"
          >
            {content.closeButton}
          </button>
        </div>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section>
    <h2 className="text-sm font-semibold text-white/90 mb-2 uppercase tracking-wide">
      {title}
    </h2>
    {children}
  </section>
);

export default PrivacyPolicy;
