import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useToast } from '../../contexts/ToastContext.tsx';
import { formatSupabaseError } from '../../lib/errorHandler.ts';
import { X, Loader2, FolderPlus } from 'lucide-react';
import type { Project } from '../../types/database.ts';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated?: (project: Project) => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  onClose,
  onProjectCreated,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanName = name.trim();
    if (!cleanName) {
      setErrorMessage('Project name is required.');
      return;
    }

    if (cleanName.length > 80) {
      setErrorMessage('Project name cannot exceed 80 characters.');
      return;
    }

    if (!user) {
      setErrorMessage('You must be logged in to create a project.');
      return;
    }

    setSubmitting(true);

    try {
      const { data, error } = await supabase
        .from('projects')
        .insert({
          name: cleanName,
          description: description.trim() || null,
          owner_id: user.id,
        })
        .select()
        .single();

      if (error) {
        setErrorMessage(formatSupabaseError(error, 'Failed to create project.'));
        setSubmitting(false);
        return;
      }

      showToast(`Project "${data.name}" created!`, 'success');
      onProjectCreated?.(data as Project);
      onClose();
      navigate(`/p/${data.id}`);
    } catch (err: unknown) {
      setErrorMessage(formatSupabaseError(err, 'An unexpected error occurred while creating the project.'));
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-headline"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-none sm:rounded-2xl shadow-2xl border-0 sm:border border-slate-200 max-w-lg w-full h-full sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <FolderPlus className="w-4 h-4" />
            </div>
            <h3 id="modal-headline" className="text-base font-semibold text-slate-900">
              New project
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 flex-1 overflow-y-auto flex flex-col justify-between sm:justify-start">
          <div className="space-y-4">
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs leading-snug">
                {errorMessage}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="project-name" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Project Name <span className="text-rose-500">*</span>
                </label>
                <span className={`text-[11px] tabular-nums ${name.length > 80 ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>
                  {name.length}/80
                </span>
              </div>
              <input
                id="project-name"
                type="text"
                required
                autoFocus
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q4 Marketing Campaign, Website Redesign"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
            </div>

            <div>
              <label htmlFor="project-description" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Description <span className="text-slate-400 font-normal lowercase">(optional)</span>
              </label>
              <textarea
                id="project-description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is the goal or focus of this board?"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none"
              />
            </div>
          </div>

          <div className="pt-4 mt-auto sm:mt-0 flex items-center justify-end gap-3 border-t border-slate-100 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim() || name.length > 80}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <span>Create project</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
