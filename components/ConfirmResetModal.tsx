import React from 'react';

interface ConfirmResetModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmResetModal: React.FC<ConfirmResetModalProps> = ({ isOpen, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-800 rounded-xl shadow-2xl p-8 max-w-md w-full mx-4 border border-slate-700">
        <h2 className="text-2xl font-bold text-slate-100 mb-4">Reset Call?</h2>
        <p className="text-slate-300 mb-6">
          Are you sure you want to reset the call? This action will send your session data and return you to the lobby.
        </p>
        <div className="flex gap-4 justify-end">
          <button
            onClick={onCancel}
            className="px-6 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors font-medium"
          >
            No
          </button>
          <button
            onClick={onConfirm}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors font-medium"
          >
            Yes
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmResetModal;
