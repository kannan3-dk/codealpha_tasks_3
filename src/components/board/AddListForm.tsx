import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';

interface AddListFormProps {
  onAddList: (name: string) => Promise<boolean>;
}

export const AddListForm: React.FC<AddListFormProps> = ({ onAddList }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;

    setIsSubmitting(true);
    const success = await onAddList(cleanName);
    setIsSubmitting(false);

    if (success) {
      setName('');
      setIsOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setName('');
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-[280px] shrink-0 h-12 flex items-center gap-2 px-4 rounded-xl bg-slate-100/80 hover:bg-slate-200/90 border border-slate-200/90 text-xs font-semibold text-slate-700 hover:text-slate-900 transition-colors shadow-2xs cursor-pointer"
      >
        <Plus className="w-4 h-4 text-slate-500" />
        <span>Add another list</span>
      </button>
    );
  }

  return (
    <div className="w-[280px] shrink-0 bg-slate-100 rounded-xl border border-slate-200/90 p-3 shadow-2xs">
      <form onSubmit={handleSubmit} className="space-y-2.5">
        <input
          ref={inputRef}
          type="text"
          value={name}
          disabled={isSubmitting}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter list title..."
          maxLength={60}
          className="w-full px-3 py-2 text-xs font-semibold bg-white rounded-lg border border-slate-300 shadow-2xs placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-800"
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isSubmitting || !name.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs transition-colors cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Adding...</span>
              </>
            ) : (
              <span>Add list</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              setName('');
            }}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
            aria-label="Cancel adding list"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};
