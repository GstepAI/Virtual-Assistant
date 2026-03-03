
import React from 'react';
import type { AppMode } from '../types';

interface ModeSelectorProps {
  currentMode: AppMode;
  onSetMode: (mode: AppMode) => void;
  isQnaEnabled?: boolean;
  isDarkTheme?: boolean;
}

const ModeSelector: React.FC<ModeSelectorProps> = ({ currentMode, onSetMode, isQnaEnabled = true, isDarkTheme = true }) => {
  // When QnA is disabled, show a single "Pitch" button that does nothing
  if (!isQnaEnabled) {
    return (
      <div className="flex items-center bg-slate-800 rounded-full p-1 border border-slate-700">
        <button
          className="px-4 py-1 text-sm font-semibold rounded-full bg-blue-600 text-white cursor-default"
          disabled
        >
          Pitch
        </button>
      </div>
    );
  }

  const inactiveBg = isDarkTheme ? 'bg-[#3B4252]' : 'bg-[#878f9a]';
  const containerBg = isDarkTheme ? 'bg-[#3B4252]' : 'bg-[#878f9a]';

  return (
    <div className={`flex items-center ${containerBg} rounded-full p-1 border border-slate-700`}>
      <button
        onClick={() => onSetMode('pitch')}
        className={`px-4 py-1 text-sm font-semibold rounded-full transition-colors duration-200 ${
          currentMode === 'pitch' ? 'bg-blue-600 text-white' : `${inactiveBg} text-white`
        }`}
      >
        Pitch
      </button>
      <button
        onClick={() => onSetMode('qa')}
        className={`px-4 py-1 text-sm font-semibold rounded-full transition-colors duration-200 ${
          currentMode === 'qa' ? 'bg-blue-600 text-white' : `${inactiveBg} text-white`
        }`}
      >
        Q&A
      </button>
    </div>
  );
};

export default ModeSelector;
