import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useToast } from '../../contexts/ToastContext.tsx';
import { formatSupabaseError } from '../../lib/errorHandler.ts';
import type { Task, CommentWithProfile } from '../../types/database.ts';
import {
  X,
  Trash2,
  Check,
  Loader2,
  Calendar,
  User as UserIcon,
  AlertTriangle,
  Clock,
  Flag,
  FileText,
  MessageSquare,
  Send,
} from 'lucide-react';

export interface ProjectMemberOption {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface TaskModalProps {
  task: Task | null;
  listName?: string;
  members: ProjectMemberOption[];
  onClose: () => void;
  onUpdateTask: (updatedTask: Task) => void;
  onDeleteTask: (taskId: string) => Promise<boolean>;
}

// Relative time helper
function formatRelativeTime(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    if (diffSecs < 45) return 'just now';
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'recently';
  }
}

export const TaskModal: React.FC<TaskModalProps> = ({
  task,
  listName,
  members,
  onClose,
  onUpdateTask,
  onDeleteTask,
}) => {
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const modalRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [dueDate, setDueDate] = useState('');
  const [assigneeId, setAssigneeId] = useState('');

  // Status & feedback states
  const [isSaving, setIsSaving] = useState(false);
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Delete confirmation state
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Comments state
  const [comments, setComments] = useState<CommentWithProfile[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentContent, setCommentContent] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  // Load comments
  const loadComments = useCallback(async (taskId: string) => {
    setLoadingComments(true);
    setCommentsError(null);
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*, profiles(username, display_name, avatar_url)')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

      if (error) {
        setCommentsError(formatSupabaseError(error, 'Failed to load comments'));
      } else {
        setComments((data as CommentWithProfile[]) || []);
      }
    } catch (err: unknown) {
      setCommentsError(formatSupabaseError(err, 'Error loading comments'));
    } finally {
      setLoadingComments(false);
    }
  }, []);

  // Sync state when task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title || '');
      setDescription(task.description || '');
      setPriority(task.priority || 'medium');
      setDueDate(task.due_date ? task.due_date.slice(0, 10) : '');
      setAssigneeId(task.assignee_id || '');
      setErrorMessage(null);
      setShowSavedFeedback(false);
      setConfirmingDelete(false);
      setCommentContent('');

      loadComments(task.id);
    }
  }, [task, loadComments]);

  // Real-time comments subscription
  useEffect(() => {
    if (!task?.id) return;

    const taskId = task.id;
    const commentChannel = supabase
      .channel(`comments:${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comments',
          filter: `task_id=eq.${taskId}`,
        },
        async (payload) => {
          const newRow = payload.new as {
            id: string;
            task_id: string;
            author_id: string;
            content: string;
            created_at: string;
          };

          setComments((prev) => {
            // Idempotent: don't add if already in state (e.g. from own optimistic update)
            if (prev.some((c) => c.id === newRow.id)) return prev;

            // Fetch author profile if available
            supabase
              .from('profiles')
              .select('username, display_name, avatar_url')
              .eq('id', newRow.author_id)
              .maybeSingle()
              .then(({ data: profileData }) => {
                if (profileData) {
                  setComments((current) =>
                    current.map((c) =>
                      c.id === newRow.id ? { ...c, profiles: profileData } : c
                    )
                  );
                }
              });

            return [...prev, { ...newRow, profiles: null }];
          });

          // Sync task comment count
          const currentCount = Array.isArray(task.comments)
            ? task.comments[0]?.count ?? 0
            : (task.comments as { count: number } | undefined)?.count ?? 0;
          onUpdateTask({ ...task, comments: [{ count: currentCount + 1 }] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'comments',
          filter: `task_id=eq.${taskId}`,
        },
        (payload) => {
          const oldRow = payload.old as { id: string };
          if (oldRow?.id) {
            setComments((prev) => {
              if (!prev.some((c) => c.id === oldRow.id)) return prev;
              return prev.filter((c) => c.id !== oldRow.id);
            });

            // Decrement comment count on board card
            const currentCount = Array.isArray(task.comments)
              ? task.comments[0]?.count ?? 0
              : (task.comments as { count: number } | undefined)?.count ?? 0;
            onUpdateTask({
              ...task,
              comments: [{ count: Math.max(0, currentCount - 1) }],
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(commentChannel);
    };
  }, [task?.id, onUpdateTask]);

  // Auto-scroll to newest comment on load or new comment
  useEffect(() => {
    if (comments.length > 0) {
      commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [comments.length]);

  // Focus trap and ESC key listener
  useEffect(() => {
    if (!task) return;

    firstInputRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmingDelete) {
          setConfirmingDelete(false);
        } else {
          onClose();
        }
        return;
      }

      // Trap focus
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const focusable = Array.from(focusableElements).filter(
          (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
        );

        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [task, onClose, confirmingDelete]);

  // Debounce text edits that auto-save
  const hasInitializedRef = useRef(false);
  const taskRef = useRef(task);
  taskRef.current = task;

  useEffect(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      return;
    }

    const currentTask = taskRef.current;
    if (!currentTask) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    const isDirty =
      trimmedTitle !== (currentTask.title || '') ||
      (description.trim() || '') !== (currentTask.description?.trim() || '');

    if (!isDirty) return;

    const timer = setTimeout(() => {
      handleSave(undefined, true);
    }, 750);

    return () => clearTimeout(timer);
  }, [title, description]);

  if (!task) return null;

  // Save task fields
  const handleSave = async (e?: React.FormEvent, isDebouncedAutoSave = false) => {
    if (e) e.preventDefault();
    setErrorMessage(null);

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      if (!isDebouncedAutoSave) {
        setErrorMessage('Task title cannot be empty.');
      }
      return;
    }

    if (!isDebouncedAutoSave) {
      setIsSaving(true);
    }
    setShowSavedFeedback(false);

    try {
      const payload = {
        title: cleanTitle,
        description: description.trim() || null,
        priority,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        assignee_id: assigneeId ? assigneeId : null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', task.id)
        .select(
          '*, assignee:profiles!tasks_assignee_id_fkey(id, username, display_name, avatar_url), creator:profiles!tasks_created_by_fkey(id, username, display_name, avatar_url), comments(count)'
        )
        .single();

      if (error) {
        setErrorMessage(formatSupabaseError(error, 'Failed to update task.'));
        setIsSaving(false);
        return;
      }

      onUpdateTask(data as Task);
      setShowSavedFeedback(true);
      setTimeout(() => {
        setShowSavedFeedback(false);
      }, 2500);
    } catch (err: unknown) {
      setErrorMessage(formatSupabaseError(err, 'An unexpected error occurred while saving.'));
    } finally {
      setIsSaving(false);
    }
  };

  // Add Comment
  const handleAddComment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = commentContent.trim();
    if (!clean || !user || !task) return;
    if (clean.length > 1000) return;

    setIsPostingComment(true);

    // Optimistic comment
    const tempCommentId = `temp-${Date.now()}`;
    const optimisticComment: CommentWithProfile = {
      id: tempCommentId,
      task_id: task.id,
      author_id: user.id,
      content: clean,
      created_at: new Date().toISOString(),
      profiles: {
        username: profile?.username || user.user_metadata?.username || 'user',
        display_name: profile?.display_name || user.user_metadata?.display_name || null,
        avatar_url: profile?.avatar_url || null,
      },
    };

    setComments((prev) => [...prev, optimisticComment]);
    setCommentContent('');

    // Update board card comment count immediately
    const currentCount = Array.isArray(task.comments)
      ? task.comments[0]?.count ?? 0
      : (task.comments as { count: number } | undefined)?.count ?? 0;

    const updatedTask = {
      ...task,
      comments: [{ count: currentCount + 1 }],
    };
    onUpdateTask(updatedTask);

    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({
          task_id: task.id,
          author_id: user.id,
          content: clean,
        })
        .select('*, profiles(username, display_name, avatar_url)')
        .single();

      if (error) throw error;

      // Replace optimistic comment
      setComments((prev) =>
        prev.map((c) => (c.id === tempCommentId ? (data as CommentWithProfile) : c))
      );
    } catch (err: unknown) {
      // Revert optimistic comment
      setComments((prev) => prev.filter((c) => c.id !== tempCommentId));
      const revertedTask = {
        ...task,
        comments: [{ count: currentCount }],
      };
      onUpdateTask(revertedTask);
      showToast(formatSupabaseError(err, 'Failed to post comment'), 'error');
    } finally {
      setIsPostingComment(false);
    }
  };

  // Delete Comment
  const handleDeleteComment = async (commentId: string) => {
    if (!task) return;
    setDeletingCommentId(commentId);

    try {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;

      setComments((prev) => prev.filter((c) => c.id !== commentId));

      // Decrement board card comment count
      const currentCount = Array.isArray(task.comments)
        ? task.comments[0]?.count ?? 0
        : (task.comments as { count: number } | undefined)?.count ?? 0;

      const updatedTask = {
        ...task,
        comments: [{ count: Math.max(0, currentCount - 1) }],
      };
      onUpdateTask(updatedTask);
      showToast('Comment deleted', 'success');
    } catch (err: unknown) {
      showToast(formatSupabaseError(err, 'Failed to delete comment'), 'error');
    } finally {
      setDeletingCommentId(null);
    }
  };

  // Keyboard shortcut for comment box: Ctrl+Enter or Cmd+Enter
  const handleCommentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleAddComment();
    }
  };

  // Delete Task
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const success = await onDeleteTask(task.id);
      if (success) {
        onClose();
      }
    } finally {
      setIsDeleting(false);
      setConfirmingDelete(false);
    }
  };

  // Muted metadata formatters
  const creatorName =
    task.creator?.display_name ||
    task.creator?.username ||
    (task.created_by ? 'Team member' : 'Unknown');

  const createdDateStr = task.created_at
    ? new Date(task.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  const updatedDateStr = task.updated_at
    ? new Date(task.updated_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className="bg-white rounded-none sm:rounded-2xl shadow-2xl border-0 sm:border sm:border-slate-200 max-w-2xl w-full h-full sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {listName && (
              <>
                <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                  {listName}
                </span>
                <span>·</span>
              </>
            )}
            <span>Task details</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <p className="leading-snug">{errorMessage}</p>
            </div>
          )}

          {/* Title Field */}
          <div>
            <label
              htmlFor="task-title-input"
              className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1"
            >
              Title <span className="text-rose-500">*</span>
            </label>
            <input
              ref={firstInputRef}
              id="task-title-input"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task summary or feature name..."
              className="w-full px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white rounded-lg border border-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Grid: Priority, Due Date, Assignee */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Priority */}
            <div>
              <label
                htmlFor="task-priority-select"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1"
              >
                <Flag className="w-3.5 h-3.5 text-slate-400" />
                <span>Priority</span>
              </label>
              <select
                id="task-priority-select"
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
                className="w-full px-3 py-2 text-xs font-medium text-slate-800 bg-white rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors cursor-pointer"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            {/* Due Date */}
            <div>
              <label
                htmlFor="task-duedate-input"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1"
              >
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Due Date</span>
              </label>
              <input
                id="task-duedate-input"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium text-slate-800 bg-white rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Assignee */}
            <div>
              <label
                htmlFor="task-assignee-select"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1"
              >
                <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                <span>Assignee</span>
              </label>
              <select
                id="task-assignee-select"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium text-slate-800 bg-white rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors cursor-pointer"
              >
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.display_name || member.username} (@{member.username})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="task-description-textarea"
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1"
            >
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Description</span>
            </label>
            <textarea
              id="task-description-textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more details, requirements, or acceptance criteria..."
              className="w-full p-3 text-xs text-slate-800 bg-white rounded-lg border border-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-y leading-relaxed"
            />
          </div>

          {/* Muted Metadata */}
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 font-normal">
            <span className="flex items-center gap-1">
              <UserIcon className="w-3.5 h-3.5 text-slate-300" />
              Created by <strong className="font-medium text-slate-500">{creatorName}</strong>
            </span>
            {createdDateStr && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-300" />
                  Created {createdDateStr}
                </span>
              </>
            )}
            {updatedDateStr && (
              <>
                <span>·</span>
                <span>Updated {updatedDateStr}</span>
              </>
            )}
          </div>

          {/* ========================================= */}
          {/* COMMENTS SECTION */}
          {/* ========================================= */}
          <div className="pt-4 border-t border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-blue-600" />
                <span>Comments</span>
                <span className="text-[11px] font-mono tabular-nums text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                  {comments.length}
                </span>
              </h4>
            </div>

            {/* Comments List */}
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {loadingComments ? (
                <div className="py-6 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                  <span>Loading comments...</span>
                </div>
              ) : commentsError ? (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
                  <span>{commentsError}</span>
                  <button
                    type="button"
                    onClick={() => loadComments(task.id)}
                    className="underline font-semibold hover:text-rose-900"
                  >
                    Retry
                  </button>
                </div>
              ) : comments.length === 0 ? (
                <div className="py-6 px-4 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                  <p className="text-xs text-slate-500">No comments yet.</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Leave a comment below to start the conversation!
                  </p>
                </div>
              ) : (
                comments.map((comment) => {
                  const prof = Array.isArray(comment.profiles)
                    ? comment.profiles[0]
                    : comment.profiles;

                  const displayName = prof?.display_name || prof?.username || 'Team member';
                  const username = prof?.username || 'user';
                  const initials = displayName
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0].toUpperCase())
                    .join('') || username.slice(0, 2).toUpperCase();

                  const isAuthor = comment.author_id === user?.id;
                  const isDeletingThis = deletingCommentId === comment.id;

                  return (
                    <div
                      key={comment.id}
                      className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1.5 text-xs group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold overflow-hidden shrink-0 shadow-2xs">
                            {prof?.avatar_url ? (
                              <img
                                src={prof.avatar_url}
                                alt={username}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <span>{initials}</span>
                            )}
                          </div>
                          <span className="font-semibold text-slate-900 truncate">
                            {displayName}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            @{username}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="text-[11px] text-slate-400 shrink-0">
                            {formatRelativeTime(comment.created_at)}
                          </span>
                        </div>

                        {/* Author delete button */}
                        {isAuthor && (
                          <button
                            type="button"
                            onClick={() => handleDeleteComment(comment.id)}
                            disabled={isDeletingThis}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-200/60 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                            title="Delete comment"
                            aria-label="Delete comment"
                          >
                            {isDeletingThis ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-500" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>

                      {/* Plain text content preserving line breaks */}
                      <p className="text-slate-800 text-xs leading-relaxed whitespace-pre-wrap break-words pl-8">
                        {comment.content}
                      </p>
                    </div>
                  );
                })
              )}
              <div ref={commentsEndRef} />
            </div>

            {/* Comment Input Box */}
            <form onSubmit={handleAddComment} className="space-y-2">
              <div className="relative">
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={commentContent}
                  onChange={(e) => setCommentContent(e.target.value)}
                  onKeyDown={handleCommentKeyDown}
                  placeholder="Write a comment... (Ctrl+Enter to submit)"
                  className="w-full p-3 pr-4 text-xs text-slate-800 bg-white rounded-xl border border-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <span
                  className={`text-[11px] tabular-nums font-mono ${
                    commentContent.length > 950
                      ? 'text-rose-600 font-bold'
                      : 'text-slate-400'
                  }`}
                >
                  {commentContent.length}/1000
                </span>

                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline text-[11px] text-slate-400">
                    Ctrl+Enter to submit
                  </span>
                  <button
                    type="submit"
                    disabled={isPostingComment || !commentContent.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs transition-colors cursor-pointer"
                  >
                    {isPostingComment ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3 h-3" />
                        <span>Comment</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          {/* Delete Action (with inline confirmation) */}
          <div>
            {confirmingDelete ? (
              <div className="flex items-center gap-2 animate-in fade-in">
                <span className="text-xs text-rose-600 font-medium">Delete task?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {isDeleting ? 'Deleting...' : 'Yes, delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={isDeleting}
                  className="px-2 py-1.5 rounded-lg text-slate-600 hover:bg-slate-200 text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 text-xs font-medium transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete task</span>
              </button>
            )}
          </div>

          {/* Right Action: Cancel, Saved feedback, Save button */}
          <div className="flex items-center gap-3">
            {showSavedFeedback && (
              <div className="flex items-center gap-1 text-xs font-semibold text-emerald-600 animate-in fade-in">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Saved</span>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>

            <button
              type="button"
              onClick={() => handleSave()}
              disabled={isSaving || !title.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs transition-colors cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save changes</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
