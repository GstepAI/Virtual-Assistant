import React, { useState } from 'react';
import type { Language } from '../types';

interface BugReportModalProps {
  isOpen: boolean;
  onSubmit: (bugDescription: string) => void;
  onCancel: () => void;
  language: Language;
}

const MAX_CHARACTERS = 1000;

const translations = {
  'en-US': {
    title: 'Report a Bug',
    description: "Please describe the issue you're experiencing. Your feedback helps us improve.",
    placeholder: 'Describe the bug or issue...',
    charactersRemaining: 'characters remaining',
    cancel: 'Cancel',
    send: 'Send',
    sending: 'Sending...',
  },
  'pt-BR': {
    title: 'Reportar um Problema',
    description: 'Por favor, descreva o problema que está a experienciar. O seu feedback ajuda-nos a melhorar.',
    placeholder: 'Descreva o problema...',
    charactersRemaining: 'caracteres restantes',
    cancel: 'Cancelar',
    send: 'Enviar',
    sending: 'A enviar...',
  },
};

const BugReportModal: React.FC<BugReportModalProps> = ({ isOpen, onSubmit, onCancel, language }) => {
  const [bugDescription, setBugDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const t = translations[language] || translations['en-US'];

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (bugDescription.trim() === '') return;
    setIsSubmitting(true);
    await onSubmit(bugDescription);
    setBugDescription('');
    setIsSubmitting(false);
  };

  const handleCancel = () => {
    setBugDescription('');
    onCancel();
  };

  const charactersRemaining = MAX_CHARACTERS - bugDescription.length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-800 rounded-xl shadow-2xl p-8 max-w-lg w-full mx-4 border border-slate-700">
        <h2 className="text-2xl font-bold text-slate-100 mb-4">{t.title}</h2>
        <p className="text-slate-300 mb-4">
          {t.description}
        </p>
        <textarea
          value={bugDescription}
          onChange={(e) => setBugDescription(e.target.value.slice(0, MAX_CHARACTERS))}
          placeholder={t.placeholder}
          className="w-full h-40 p-4 bg-slate-700 text-slate-100 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none resize-none placeholder-slate-400"
          maxLength={MAX_CHARACTERS}
          disabled={isSubmitting}
        />
        <div className="flex justify-between items-center mt-2 mb-4">
          <span className={`text-sm ${charactersRemaining < 100 ? 'text-amber-400' : 'text-slate-400'}`}>
            {charactersRemaining} {t.charactersRemaining}
          </span>
        </div>
        <div className="flex gap-4 justify-end">
          <button
            onClick={handleCancel}
            disabled={isSubmitting}
            className="px-6 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors font-medium disabled:opacity-50"
          >
            {t.cancel}
          </button>
          <button
            onClick={handleSubmit}
            disabled={bugDescription.trim() === '' || isSubmitting}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? t.sending : t.send}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BugReportModal;
