import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Language, VoiceGender } from '../types';

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  voiceGender: VoiceGender;
  setVoiceGender: (voiceGender: VoiceGender) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('en-US');
  const [voiceGender, setVoiceGender] = useState<VoiceGender>('female');

  return (
    <LanguageContext.Provider value={{ language, setLanguage, voiceGender, setVoiceGender }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
