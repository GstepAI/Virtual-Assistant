
import React, { useEffect, useRef } from 'react';
import type { Participant } from '../types';
import { UserIcon } from './icons';

interface ParticipantViewProps {
  participant: Participant;
}

const ParticipantView: React.FC<ParticipantViewProps> = ({ participant }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { videoSrc, isSpeaking, isAgent } = participant;

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (isAgent && isSpeaking) {
      videoElement.play().catch(e => console.warn("Agent video play prevented", e));
    } else if (isAgent && !isSpeaking) {
      videoElement.pause();
      videoElement.currentTime = 0;
    }
  }, [isSpeaking, isAgent]);

  const speakingClasses = isSpeaking ? 'ring-4 ring-green-400 ring-offset-2 ring-offset-slate-900' : 'ring-2 ring-slate-600';

  return (
    <div className="flex flex-col items-center gap-2 flex-shrink-0">
      <div className={`relative w-32 h-20 rounded-lg overflow-hidden bg-slate-800 transition-all duration-300 ${speakingClasses}`}>
        {videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            className="w-full h-full object-cover"
            loop
            muted
            playsInline
            // Autoplay for mock participants
            autoPlay={!isAgent}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <UserIcon className="w-8 h-8 text-slate-500" />
          </div>
        )}
      </div>
    </div>
  );
};

export default ParticipantView;
