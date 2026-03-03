import React from 'react';
import { MicrophoneIcon, MicrophoneOffIcon } from './icons';
import { useLanguage } from '../contexts/LanguageContext';

interface ListeningIndicatorProps {
  input: string;
  isListening: boolean;
  isMicMuted?: boolean;
  onToggleMic?: () => void;
  isDarkTheme?: boolean;
}

/**
 * Displays a floating listening indicator when in Q&A mode
 * Shows the current transcription in real-time or ready state
 */
const ListeningIndicator: React.FC<ListeningIndicatorProps> = ({ input, isListening, isMicMuted = false, onToggleMic, isDarkTheme = true }) => {
  const { language } = useLanguage();
  return (
    <div className="w-full animate-fade-in">
      <div className={`backdrop-blur-sm rounded-lg border p-3 ${isDarkTheme ? 'bg-slate-800/95 border-slate-700' : 'bg-[#868f9a] border-slate-500'}`}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex-1 flex justify-start">
            {onToggleMic && (
              <button
                onClick={onToggleMic}
                className="p-2 text-white hover:text-white transition-colors rounded-full hover:bg-slate-700/50"
                aria-label={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
              >
                {isMicMuted ? <MicrophoneOffIcon className="w-5 h-5" /> : <MicrophoneIcon className="w-5 h-5" />}
              </button>
            )}
          </div>
          <p className="text-center text-white text-sm flex items-center justify-center gap-2">
            {input ? (
              <div className={`p-2 rounded-lg border ${isDarkTheme ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-500/50 border-slate-400'}`}>
                <p className="text-white text-sm italic text-center">"{input}"</p>
              </div>
            ) : isListening ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                {language === 'pt-BR' ? 'A ouvir...' : 'Listening...'}
              </>
            ) : (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                {language === 'pt-BR' ? 'Pronto para ouvir' : 'Ready to listen'}
              </>
            )}
          </p>
          <div className="flex-1"></div>
        </div>

        </div>
      </div>
  );
};

export default ListeningIndicator;
