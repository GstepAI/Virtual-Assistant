import React from 'react';
import { Language } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { GlobeIcon } from './icons';

interface LanguageSwitchProps {
  isDarkTheme?: boolean;
}

const LanguageSwitch: React.FC<LanguageSwitchProps> = ({ isDarkTheme = true }) => {
  const { language, setLanguage } = useLanguage();

  const languages: { code: Language; label: string; flag: string }[] = [
    { code: 'en-US', label: 'English (US)', flag: '🇺🇸' },
    { code: 'en-UK', label: 'English (UK)', flag: '🇬🇧' },
    { code: 'pt-BR', label: 'Português (BR)', flag: '🇧🇷' },
  ];

  const currentLanguage = languages.find(lang => lang.code === language) || languages[0];

  return (
    <div className="relative group z-[100]">
      <button
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 border relative z-[100] ${
          isDarkTheme
            ? 'bg-slate-800/50 hover:bg-slate-700/50 border-slate-600/30 hover:border-slate-500/50'
            : 'bg-blue-100 hover:bg-blue-200 border-blue-300 hover:border-blue-400'
        }`}
        title="Change Language"
      >
        <GlobeIcon className={`w-4 h-4 ${isDarkTheme ? 'text-slate-300' : 'text-blue-800'}`} />
        <span className={`text-sm font-medium ${isDarkTheme ? 'text-slate-200' : 'text-blue-900'}`}>{currentLanguage.flag}</span>
      </button>

      <div className={`absolute right-0 mt-2 w-48 rounded-lg shadow-xl border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[100] ${
        isDarkTheme ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
      }`}>
        {languages.map((lang) => (
          <button
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            className={`w-full px-4 py-2.5 text-left flex items-center gap-3 transition-colors first:rounded-t-lg last:rounded-b-lg ${
              isDarkTheme
                ? `hover:bg-slate-700/50 ${language === lang.code ? 'bg-blue-600/20 text-blue-400' : 'text-slate-200'}`
                : `hover:bg-slate-100 ${language === lang.code ? 'bg-blue-50 text-blue-700' : 'text-slate-700'}`
            }`}
          >
            <span className="text-lg">{lang.flag}</span>
            <span className="text-sm font-medium">{lang.label}</span>
            {language === lang.code && (
              <span className={`ml-auto ${isDarkTheme ? 'text-blue-400' : 'text-blue-700'}`}>✓</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default LanguageSwitch;
