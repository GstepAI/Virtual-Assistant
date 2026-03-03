
import React from 'react';
import type { Participant } from '../types';
import ParticipantView from './ParticipantView';

interface ParticipantsPanelProps {
  participants: Participant[];
}

const ParticipantsPanel: React.FC<ParticipantsPanelProps> = ({ participants }) => {
  return (
    <div className="w-full bg-slate-900/30 rounded-xl p-2 border border-slate-700/50 mb-4">
      <div className="flex items-center gap-3 overflow-x-auto">
        {participants.map(participant => (
          <ParticipantView key={participant.id} participant={participant} />
        ))}
      </div>
    </div>
  );
};

export default ParticipantsPanel;
