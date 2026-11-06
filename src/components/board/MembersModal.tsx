import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useToast } from '../../contexts/ToastContext.tsx';
import { formatSupabaseError } from '../../lib/errorHandler.ts';
import type { Project } from '../../types/database.ts';
import {
  X,
  UserPlus,
  Trash2,
  LogOut,
  Shield,
  Crown,
  User,
  AlertTriangle,
  Loader2,
  Check,
} from 'lucide-react';

export interface BoardMemberItem {
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at?: string;
  profile: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface MembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  members: BoardMemberItem[];
  currentUserRole: 'owner' | 'admin' | 'member' | null;
  onMembersUpdated: () => void;
}

export const MembersModal: React.FC<MembersModalProps> = ({
  isOpen,
  onClose,
  project,
  members,
  currentUserRole,
  onMembersUpdated,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  // Add member form state
  const [usernameInput, setUsernameInput] = useState('');
  const [roleInput, setRoleInput] = useState<'member' | 'admin'>('member');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [addErrorMessage, setAddErrorMessage] = useState<string | null>(null);

  // Removing member state
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  // Leaving project state
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  // Delete project state
  const [showDeleteProjectSection, setShowDeleteProjectSection] = useState(false);
  const [typedConfirmationName, setTypedConfirmationName] = useState('');
  const [isDeletingProject, setIsDeletingProject] = useState(false);

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

  const isOwner = currentUserRole === 'owner';
  const isAdminOrOwner = currentUserRole === 'owner' || currentUserRole === 'admin';

  // Handle error helper using formatSupabaseError
  const handlePermissionError = (error: unknown) => {
    const msg = formatSupabaseError(error, 'Operation failed.');
    showToast(msg, 'error');
  };

  // Add Member
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddErrorMessage(null);

    const cleanUsername = usernameInput.trim().toLowerCase().replace(/^@/, '');
    if (!cleanUsername) return;

    setIsAddingMember(true);

    try {
      // 1. Look up profile
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('id, username, display_name')
        .eq('username', cleanUsername)
        .maybeSingle();

      if (profileErr) {
        handlePermissionError(profileErr);
        setIsAddingMember(false);
        return;
      }

      if (!profile) {
        setAddErrorMessage('No user with that username');
        setIsAddingMember(false);
        return;
      }

      // Check if already a member
      const alreadyMember = members.some((m) => m.user_id === profile.id);
      if (alreadyMember) {
        setAddErrorMessage(`@${profile.username} is already a member of this project.`);
        setIsAddingMember(false);
        return;
      }

      // 2. Insert into project_members
      const { error: insertErr } = await supabase
        .from('project_members')
        .insert({
          project_id: project.id,
          user_id: profile.id,
          role: roleInput,
        });

      if (insertErr) {
        handlePermissionError(insertErr);
        setIsAddingMember(false);
        return;
      }

      showToast(`Added @${profile.username} as ${roleInput}`, 'success');
      setUsernameInput('');
      setRoleInput('member');
      onMembersUpdated();
    } catch (err: unknown) {
      handlePermissionError(err);
    } finally {
      setIsAddingMember(false);
    }
  };

  // Remove Member
  const handleRemoveMember = async (targetUserId: string, targetUsername: string) => {
    setRemovingUserId(targetUserId);
    try {
      const { error } = await supabase
        .from('project_members')
        .delete()
        .eq('project_id', project.id)
        .eq('user_id', targetUserId);

      if (error) {
        handlePermissionError(error);
        return;
      }

      showToast(`Removed @${targetUsername}`, 'success');
      onMembersUpdated();
    } catch (err: unknown) {
      handlePermissionError(err);
    } finally {
      setRemovingUserId(null);
    }
  };

  // Leave Project
  const handleLeaveProject = async () => {
    if (!user) return;
    setIsLeaving(true);
    try {
      const { error } = await supabase
        .from('project_members')
        .delete()
        .eq('project_id', project.id)
        .eq('user_id', user.id);

      if (error) {
        handlePermissionError(error);
        setIsLeaving(false);
        return;
      }

      showToast(`You left "${project.name}"`, 'info');
      onClose();
      navigate('/');
    } catch (err: unknown) {
      handlePermissionError(err);
      setIsLeaving(false);
    }
  };

  // Delete Project (Owner only, typed name confirmation)
  const handleDeleteProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (typedConfirmationName.trim() !== project.name.trim()) return;

    setIsDeletingProject(true);
    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', project.id);

      if (error) {
        handlePermissionError(error);
        setIsDeletingProject(false);
        return;
      }

      showToast(`Project "${project.name}" deleted`, 'success');
      onClose();
      navigate('/');
    } catch (err: unknown) {
      handlePermissionError(err);
      setIsDeletingProject(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="members-panel-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-none sm:rounded-2xl shadow-2xl border-0 sm:border border-slate-200 max-w-lg w-full h-full sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <h3 id="members-panel-title" className="text-base font-bold text-slate-900">
              Project Members
            </h3>
            <span className="text-xs font-mono tabular-nums text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {members.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Add Member Section (Owner & Admins only) */}
          {isAdminOrOwner && (
            <div className="bg-slate-50/90 rounded-xl p-4 border border-slate-200/80">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5 text-blue-600" />
                <span>Add member by username</span>
              </h4>

              {addErrorMessage && (
                <div className="mb-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{addErrorMessage}</span>
                </div>
              )}

              <form onSubmit={handleAddMember} className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs font-mono">
                      @
                    </span>
                    <input
                      type="text"
                      required
                      value={usernameInput}
                      onChange={(e) => {
                        setUsernameInput(e.target.value);
                        if (addErrorMessage) setAddErrorMessage(null);
                      }}
                      placeholder="username"
                      className="w-full pl-7 pr-3 py-2 text-xs bg-white rounded-lg border border-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors font-mono"
                    />
                  </div>

                  <select
                    value={roleInput}
                    onChange={(e) => setRoleInput(e.target.value as 'member' | 'admin')}
                    className="px-2.5 py-2 text-xs font-medium text-slate-800 bg-white rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors cursor-pointer"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>

                  <button
                    type="submit"
                    disabled={isAddingMember || !usernameInput.trim()}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs transition-colors shrink-0 cursor-pointer"
                  >
                    {isAddingMember ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Members List */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Workspace Team ({members.length})
            </h4>

            <div className="divide-y divide-slate-100 border border-slate-200/90 rounded-xl overflow-hidden bg-white">
              {members.map((member) => {
                const isMemberOwner = member.role === 'owner';
                const isCurrentUser = member.user_id === user?.id;
                const canRemove =
                  !isMemberOwner &&
                  !isCurrentUser &&
                  (isOwner || (currentUserRole === 'admin' && member.role === 'member'));

                const memberInitials = (
                  member.profile.display_name || member.profile.username
                )
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0].toUpperCase())
                  .join('') || member.profile.username.slice(0, 2).toUpperCase();

                return (
                  <div
                    key={member.user_id}
                    className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-semibold shrink-0 overflow-hidden shadow-2xs">
                        {member.profile.avatar_url ? (
                          <img
                            src={member.profile.avatar_url}
                            alt={member.profile.username}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span>{memberInitials}</span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-semibold text-slate-900 truncate">
                            {member.profile.display_name || member.profile.username}
                          </p>
                          {isCurrentUser && (
                            <span className="text-[10px] text-slate-400 font-normal">
                              (you)
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 truncate font-mono">
                          @{member.profile.username}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Role Badge */}
                      {member.role === 'owner' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-md">
                          <Crown className="w-3 h-3 text-amber-600" />
                          <span>Owner</span>
                        </span>
                      ) : member.role === 'admin' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-md">
                          <Shield className="w-3 h-3 text-blue-600" />
                          <span>Admin</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>Member</span>
                        </span>
                      )}

                      {/* Remove Button (Admins & Owners can remove non-owners) */}
                      {canRemove && (
                        <button
                          type="button"
                          onClick={() =>
                            handleRemoveMember(member.user_id, member.profile.username)
                          }
                          disabled={removingUserId === member.user_id}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                          title="Remove member from project"
                          aria-label={`Remove @${member.profile.username}`}
                        >
                          {removingUserId === member.user_id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Leave Project Option (Non-owners only) */}
          {!isOwner && (
            <div className="pt-4 border-t border-slate-100">
              {confirmingLeave ? (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2.5 animate-in fade-in">
                  <p className="text-xs font-semibold text-rose-900">
                    Are you sure you want to leave this project?
                  </p>
                  <p className="text-[11px] text-rose-700 leading-relaxed">
                    You will lose access to this board unless re-invited by an admin.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleLeaveProject}
                      disabled={isLeaving}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {isLeaving ? 'Leaving...' : 'Yes, leave project'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingLeave(false)}
                      disabled={isLeaving}
                      className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-200 text-xs transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingLeave(true)}
                  className="flex items-center gap-2 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-3 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Leave project</span>
                </button>
              )}
            </div>
          )}

          {/* Delete Project Section (Owner Only) */}
          {isOwner && (
            <div className="pt-4 border-t border-slate-100">
              {!showDeleteProjectSection ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteProjectSection(true)}
                  className="flex items-center gap-2 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-3 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete project...</span>
                </button>
              ) : (
                <div className="p-4 bg-rose-50/90 border border-rose-200 rounded-xl space-y-3 animate-in fade-in">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <h5 className="text-xs font-bold text-rose-900">
                        Delete project permanently
                      </h5>
                      <p className="text-[11px] text-rose-700 mt-1 leading-relaxed">
                        This will permanently delete the project, all lists, tasks, and member associations.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleDeleteProject} className="space-y-2.5 pt-1">
                    <label
                      htmlFor="confirm-project-name"
                      className="block text-[11px] text-slate-700"
                    >
                      Type{' '}
                      <strong className="font-semibold text-slate-900 select-all">
                        {project.name}
                      </strong>{' '}
                      to confirm:
                    </label>
                    <input
                      id="confirm-project-name"
                      type="text"
                      value={typedConfirmationName}
                      onChange={(e) => setTypedConfirmationName(e.target.value)}
                      placeholder={project.name}
                      className="w-full px-3 py-2 text-xs bg-white rounded-lg border border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-900 font-medium"
                    />

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowDeleteProjectSection(false);
                          setTypedConfirmationName('');
                        }}
                        disabled={isDeletingProject}
                        className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={
                          isDeletingProject ||
                          typedConfirmationName.trim() !== project.name.trim()
                        }
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 active:bg-rose-800 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition-colors cursor-pointer"
                      >
                        {isDeletingProject ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Deleting...</span>
                          </>
                        ) : (
                          <span>Delete project</span>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
