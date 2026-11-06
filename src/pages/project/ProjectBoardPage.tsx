import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import { supabase } from '../../lib/supabaseClient.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useToast } from '../../contexts/ToastContext.tsx';
import { formatSupabaseError } from '../../lib/errorHandler.ts';
import type { Project, List, Task } from '../../types/database.ts';
import { ListColumn } from '../../components/board/ListColumn.tsx';
import { AddListForm } from '../../components/board/AddListForm.tsx';
import { DeleteListModal } from '../../components/board/DeleteListModal.tsx';
import { TaskModal, type ProjectMemberOption } from '../../components/board/TaskModal.tsx';
import { MembersModal, type BoardMemberItem } from '../../components/board/MembersModal.tsx';
import {
  ChevronRight,
  AlertCircle,
  ArrowLeft,
  Calendar,
  Layers,
  RefreshCw,
  Users,
} from 'lucide-react';

export const ProjectBoardPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTaskId = searchParams.get('task');

  const { user } = useAuth();
  const { showToast } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [lists, setLists] = useState<List[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<ProjectMemberOption[]>([]);
  const [detailedMembers, setDetailedMembers] = useState<BoardMemberItem[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<'owner' | 'admin' | 'member' | null>(null);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');
  const hasConnectedOnceRef = useRef(false);

  // Dragging conflict avoidance queue
  const isDraggingRef = useRef(false);
  const queuedRealtimeFnsRef = useRef<Array<() => void>>([]);

  const queueOrApply = useCallback((fn: () => void) => {
    if (isDraggingRef.current) {
      queuedRealtimeFnsRef.current.push(fn);
    } else {
      fn();
    }
  }, []);

  // Delete list modal state
  const [listToDelete, setListToDelete] = useState<List | null>(null);
  const [isDeletingList, setIsDeletingList] = useState(false);

  // Group tasks by list_id, sorted by position ascending
  const tasksByList = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const list of lists) {
      map.set(list.id, []);
    }
    // Sort all tasks by position
    const sortedTasks = [...tasks].sort((a, b) => a.position - b.position);
    for (const task of sortedTasks) {
      const existing = map.get(task.list_id);
      if (existing) {
        existing.push(task);
      } else {
        map.set(task.list_id, [task]);
      }
    }
    return map;
  }, [lists, tasks]);

  // Active task for modal (from ?task=<taskId>)
  const activeTask = useMemo(() => {
    if (!activeTaskId) return null;
    return tasks.find((t) => t.id === activeTaskId) || null;
  }, [tasks, activeTaskId]);

  const activeTaskList = useMemo(() => {
    if (!activeTask) return undefined;
    return lists.find((l) => l.id === activeTask.list_id);
  }, [activeTask, lists]);

  const loadBoardData = useCallback(async () => {
    if (!projectId || !user) return;
    setLoading(true);
    setNotFound(false);

    try {
      // 1. Load project name and description
      const { data: projData, error: projErr } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .maybeSingle();

      if (projErr || !projData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      // Check membership in project_members
      const { data: memberData, error: memberErr } = await supabase
        .from('project_members')
        .select('role')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (memberErr || !memberData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setProject(projData as Project);

      // 2. Load lists
      const { data: listsData, error: listsErr } = await supabase
        .from('lists')
        .select('*')
        .eq('project_id', projectId)
        .order('position');

      if (listsErr) {
        showToast(formatSupabaseError(listsErr, 'Failed to load lists.'), 'error');
      } else {
        setLists((listsData as List[]) || []);
      }

      // 3. Load tasks
      const { data: tasksData, error: tasksErr } = await supabase
        .from('tasks')
        .select(
          '*, assignee:profiles!tasks_assignee_id_fkey(id, username, display_name, avatar_url), creator:profiles!tasks_created_by_fkey(id, username, display_name, avatar_url), comments(count)'
        )
        .eq('project_id', projectId)
        .order('position');

      if (tasksErr) {
        showToast(formatSupabaseError(tasksErr, 'Failed to load tasks.'), 'error');
      } else {
        setTasks((tasksData as Task[]) || []);
      }

      // 4. Load members
      const { data: projectMembersData, error: membersErr } = await supabase
        .from('project_members')
        .select('user_id, role, joined_at, profiles(id, username, display_name, avatar_url)')
        .eq('project_id', projectId);

      if (!membersErr && projectMembersData) {
        interface MemberRow {
          user_id: string;
          role: 'owner' | 'admin' | 'member';
          joined_at?: string;
          profiles:
            | { id: string; username: string; display_name: string | null; avatar_url: string | null }
            | Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null }>
            | null;
        }

        const detailedList: BoardMemberItem[] = (projectMembersData as MemberRow[]).map(
          (m) => {
            const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
            return {
              user_id: m.user_id,
              role: m.role,
              joined_at: m.joined_at,
              profile: {
                id: p?.id || m.user_id,
                username: p?.username || 'member',
                display_name: p?.display_name || null,
                avatar_url: p?.avatar_url || null,
              },
            };
          }
        );

        setDetailedMembers(detailedList);

        const myMember = detailedList.find((m) => m.user_id === user.id);
        setCurrentUserRole(myMember?.role || null);

        setMembers(
          detailedList.map((m) => ({
            id: m.profile.id,
            username: m.profile.username,
            display_name: m.profile.display_name,
            avatar_url: m.profile.avatar_url,
          }))
        );
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [projectId, user, showToast]);

  useEffect(() => {
    loadBoardData();
  }, [loadBoardData]);

  // Real-time channel: ONE channel per project (tasks, lists, project_members)
  useEffect(() => {
    if (!projectId || !user) return;

    const channel = supabase.channel(`project:${projectId}`);

    // 1. Tasks Listener (Idempotent: INSERT -> add if not present, UPDATE -> merge & refetch assignee only if changed, DELETE -> remove by old.id)
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `project_id=eq.${projectId}`,
      },
      (payload) => {
        queueOrApply(() => {
          if (payload.eventType === 'INSERT') {
            const newRow = payload.new as Task;
            setTasks((prev) => {
              if (prev.some((t) => t.id === newRow.id)) return prev;

              // Refetch assignee if assignee_id is set
              if (newRow.assignee_id) {
                supabase
                  .from('profiles')
                  .select('id, username, display_name, avatar_url')
                  .eq('id', newRow.assignee_id)
                  .maybeSingle()
                  .then(({ data: profileData }) => {
                    if (profileData) {
                      setTasks((current) =>
                        current.map((t) =>
                          t.id === newRow.id ? { ...t, assignee: profileData } : t
                        )
                      );
                    }
                  });
              }

              return [...prev, { ...newRow, comments: newRow.comments || [] }].sort(
                (a, b) => a.position - b.position
              );
            });
          } else if (payload.eventType === 'UPDATE') {
            const updatedRow = payload.new as Task;
            setTasks((prev) => {
              const existing = prev.find((t) => t.id === updatedRow.id);
              if (!existing) {
                return [...prev, updatedRow].sort((a, b) => a.position - b.position);
              }

              // Keep already-loaded assignee unless assignee_id changed
              let assignee = existing.assignee;
              if (updatedRow.assignee_id !== existing.assignee_id) {
                if (updatedRow.assignee_id) {
                  supabase
                    .from('profiles')
                    .select('id, username, display_name, avatar_url')
                    .eq('id', updatedRow.assignee_id)
                    .maybeSingle()
                    .then(({ data: profileData }) => {
                      if (profileData) {
                        setTasks((current) =>
                          current.map((t) =>
                            t.id === updatedRow.id ? { ...t, assignee: profileData } : t
                          )
                        );
                      }
                    });
                } else {
                  assignee = null;
                }
              }

              const merged: Task = {
                ...existing,
                ...updatedRow,
                assignee,
                creator: existing.creator,
                comments: existing.comments,
              };

              return prev
                .map((t) => (t.id === updatedRow.id ? merged : t))
                .sort((a, b) => a.position - b.position);
            });
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as { id: string };
            if (oldRow?.id) {
              setTasks((prev) => prev.filter((t) => t.id !== oldRow.id));
            }
          }
        });
      }
    );

    // 2. Lists Listener (Idempotent: INSERT, UPDATE, DELETE)
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'lists',
        filter: `project_id=eq.${projectId}`,
      },
      (payload) => {
        queueOrApply(() => {
          if (payload.eventType === 'INSERT') {
            const newRow = payload.new as List;
            setLists((prev) => {
              if (prev.some((l) => l.id === newRow.id)) return prev;
              return [...prev, newRow].sort((a, b) => a.position - b.position);
            });
          } else if (payload.eventType === 'UPDATE') {
            const updatedRow = payload.new as List;
            setLists((prev) =>
              prev
                .map((l) => (l.id === updatedRow.id ? { ...l, ...updatedRow } : l))
                .sort((a, b) => a.position - b.position)
            );
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as { id: string };
            if (oldRow?.id) {
              setLists((prev) => prev.filter((l) => l.id !== oldRow.id));
            }
          }
        });
      }
    );

    // 3. Project Members Listener (Idempotent refetch)
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'project_members',
        filter: `project_id=eq.${projectId}`,
      },
      () => {
        queueOrApply(() => {
          supabase
            .from('project_members')
            .select('user_id, role, joined_at, profiles(id, username, display_name, avatar_url)')
            .eq('project_id', projectId)
            .then(({ data }) => {
              if (data) {
                interface MemberRow {
                  user_id: string;
                  role: 'owner' | 'admin' | 'member';
                  joined_at?: string;
                  profiles:
                    | { id: string; username: string; display_name: string | null; avatar_url: string | null }
                    | Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null }>
                    | null;
                }

                const detailedList: BoardMemberItem[] = (data as MemberRow[]).map((m) => {
                  const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
                  return {
                    user_id: m.user_id,
                    role: m.role,
                    joined_at: m.joined_at,
                    profile: {
                      id: p?.id || m.user_id,
                      username: p?.username || 'member',
                      display_name: p?.display_name || null,
                      avatar_url: p?.avatar_url || null,
                    },
                  };
                });

                setDetailedMembers(detailedList);
                const myMember = detailedList.find((m) => m.user_id === user.id);
                setCurrentUserRole(myMember?.role || null);
                setMembers(
                  detailedList.map((m) => ({
                    id: m.profile.id,
                    username: m.profile.username,
                    display_name: m.profile.display_name,
                    avatar_url: m.profile.avatar_url,
                  }))
                );
              }
            });
        });
      }
    );

    // Channel status subscription
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setRealtimeStatus('live');
        if (hasConnectedOnceRef.current) {
          // After a reconnect, refetch lists and tasks once so nothing was missed
          loadBoardData();
        }
        hasConnectedOnceRef.current = true;
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setRealtimeStatus('reconnecting');
      } else if (status === 'CLOSED') {
        setRealtimeStatus('reconnecting');
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, user, loadBoardData, queueOrApply]);

  // Handle URL param ?task=<id>
  useEffect(() => {
    if (!loading && activeTaskId && !activeTask && project) {
      supabase
        .from('tasks')
        .select(
          '*, assignee:profiles!tasks_assignee_id_fkey(id, username, display_name, avatar_url), creator:profiles!tasks_created_by_fkey(id, username, display_name, avatar_url), comments(count)'
        )
        .eq('id', activeTaskId)
        .eq('project_id', projectId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (data && !error) {
            setTasks((prev) => {
              if (prev.some((t) => t.id === data.id)) return prev;
              return [...prev, data as Task];
            });
          } else {
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.delete('task');
              return next;
            });
          }
        });
    }
  }, [loading, activeTaskId, activeTask, project, projectId, setSearchParams]);

  // Open task modal and sync URL
  const handleSelectTask = (task: Task) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('task', task.id);
      return next;
    });
  };

  // Close task modal and remove ?task from URL
  const handleCloseTaskModal = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('task');
      return next;
    });
  };

  // Immediate update of card on board
  const handleUpdateTask = (updatedTask: Task) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === updatedTask.id ? updatedTask : t))
    );
  };

  // Delete task from Supabase and remove from board state
  const handleDeleteTask = async (taskId: string): Promise<boolean> => {
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', taskId);
      if (error) throw error;

      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      showToast('Task deleted', 'success');
      handleCloseTaskModal();
      return true;
    } catch (err: unknown) {
      showToast(formatSupabaseError(err, 'Failed to delete task.'), 'error');
      return false;
    }
  };

  // Drag start: pause realtime state updates to prevent moving card under user pointer
  const handleDragStart = () => {
    isDraggingRef.current = true;
  };

  // Handle Drag & Drop End
  const handleDragEnd = async (result: DropResult) => {
    isDraggingRef.current = false;

    // Helper to apply all queued realtime changes that arrived during dragging
    const drainQueue = () => {
      if (queuedRealtimeFnsRef.current.length > 0) {
        const pending = [...queuedRealtimeFnsRef.current];
        queuedRealtimeFnsRef.current = [];
        pending.forEach((fn) => fn());
      }
    };

    const { destination, source, draggableId, type } = result;

    if (!destination) {
      drainQueue();
      return;
    }
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      drainQueue();
      return;
    }

    // ==========================================
    // 1. REORDERING LISTS HORIZONTALLY
    // ==========================================
    if (type === 'COLUMN') {
      const listId = draggableId.replace('list-', '');
      const movedList = lists.find((l) => l.id === listId);
      if (!movedList) return;

      const previousLists = [...lists];
      const otherLists = lists.filter((l) => l.id !== listId);
      const destIndex = destination.index;

      let newPosition: number;
      let needRenumber = false;

      if (otherLists.length === 0) {
        newPosition = 1000;
      } else if (destIndex === 0) {
        const first = otherLists[0];
        newPosition = first.position - 1000 / 2;
        if (Math.abs(first.position - newPosition) < 0.001) {
          needRenumber = true;
        }
      } else if (destIndex >= otherLists.length) {
        const last = otherLists[otherLists.length - 1];
        newPosition = last.position + 1000;
        if (Math.abs(newPosition - last.position) < 0.001) {
          needRenumber = true;
        }
      } else {
        const prev = otherLists[destIndex - 1];
        const next = otherLists[destIndex];
        newPosition = (prev.position + next.position) / 2;
        if (
          Math.abs(newPosition - prev.position) < 0.001 ||
          Math.abs(next.position - newPosition) < 0.001
        ) {
          needRenumber = true;
        }
      }

      const updatedLists = [...otherLists];
      updatedLists.splice(destIndex, 0, { ...movedList, position: newPosition });

      if (needRenumber) {
        const renumberedLists = updatedLists.map((l, idx) => ({
          ...l,
          position: (idx + 1) * 1000,
        }));
        setLists(renumberedLists);

        try {
          await Promise.all(
            renumberedLists.map((l) =>
              supabase
                .from('lists')
                .update({ position: l.position })
                .eq('id', l.id)
            )
          );
        } catch (err: unknown) {
          setLists(previousLists);
          showToast(formatSupabaseError(err, 'Failed to reorder lists.'), 'error');
        }
      } else {
        setLists(updatedLists);

        try {
          const { error } = await supabase
            .from('lists')
            .update({ position: newPosition })
            .eq('id', movedList.id);

          if (error) throw error;
        } catch (err: unknown) {
          setLists(previousLists);
          showToast(formatSupabaseError(err, 'Failed to reorder lists.'), 'error');
        }
      }
      drainQueue();
      return;
    }

    // ==========================================
    // 2. REORDERING TASKS (WITHIN OR ACROSS LISTS)
    // ==========================================
    const taskId = draggableId;
    const movedTask = tasks.find((t) => t.id === taskId);
    if (!movedTask) return;

    const destListId = destination.droppableId;
    const previousTasks = [...tasks];

    // Destination list items excluding moved item, sorted by position
    const destItems = tasks
      .filter((t) => t.list_id === destListId && t.id !== taskId)
      .sort((a, b) => a.position - b.position);

    const destIndex = destination.index;
    let newPosition: number;
    let needRenumber = false;

    if (destItems.length === 0) {
      newPosition = 1000;
    } else if (destIndex === 0) {
      const first = destItems[0];
      newPosition = first.position - 1000 / 2;
      if (Math.abs(first.position - newPosition) < 0.001) {
        needRenumber = true;
      }
    } else if (destIndex >= destItems.length) {
      const last = destItems[destItems.length - 1];
      newPosition = last.position + 1000;
      if (Math.abs(newPosition - last.position) < 0.001) {
        needRenumber = true;
      }
    } else {
      const prev = destItems[destIndex - 1];
      const next = destItems[destIndex];
      newPosition = (prev.position + next.position) / 2;
      if (
        Math.abs(newPosition - prev.position) < 0.001 ||
        Math.abs(next.position - newPosition) < 0.001
      ) {
        needRenumber = true;
      }
    }

    const updatedMovedTask: Task = {
      ...movedTask,
      list_id: destListId,
      position: newPosition,
    };

    if (needRenumber) {
      // Renumber destination list items in steps of 1000
      const reorderedDestItems = [...destItems];
      reorderedDestItems.splice(destIndex, 0, updatedMovedTask);

      const renumberedDestItems = reorderedDestItems.map((t, idx) => ({
        ...t,
        position: (idx + 1) * 1000,
      }));

      // Optimistic state update
      setTasks((prev) => {
        const unaffected = prev.filter(
          (t) => t.list_id !== destListId && t.id !== taskId
        );
        return [...unaffected, ...renumberedDestItems].sort(
          (a, b) => a.position - b.position
        );
      });

      // Single batch of updates to Supabase
      try {
        await Promise.all(
          renumberedDestItems.map((t) =>
            supabase
              .from('tasks')
              .update({ list_id: destListId, position: t.position })
              .eq('id', t.id)
          )
        );
      } catch (err: unknown) {
        setTasks(previousTasks);
        showToast(formatSupabaseError(err, 'Failed to update task positions.'), 'error');
      }
    } else {
      // Optimistic single task update
      setTasks((prev) => {
        return prev
          .map((t) => (t.id === taskId ? updatedMovedTask : t))
          .sort((a, b) => a.position - b.position);
      });

      try {
        const { error } = await supabase
          .from('tasks')
          .update({ list_id: destListId, position: newPosition })
          .eq('id', taskId);

        if (error) throw error;
      } catch (err: unknown) {
        setTasks(previousTasks);
        showToast(formatSupabaseError(err, 'Failed to move task.'), 'error');
      }
    }
    drainQueue();
  };

  // Handle adding list
  const handleAddList = async (name: string): Promise<boolean> => {
    if (!projectId) return false;
    const lastPosition =
      lists.length > 0 ? Math.max(...lists.map((l) => l.position)) : 0;
    const newPosition = lastPosition + 1000;

    try {
      const { data, error } = await supabase
        .from('lists')
        .insert({
          project_id: projectId,
          name,
          position: newPosition,
        })
        .select('*')
        .single();

      if (error) throw error;

      setLists((prev) => [...prev, data as List]);
      showToast(`List "${name}" created`, 'success');
      return true;
    } catch (err: unknown) {
      showToast(formatSupabaseError(err, 'Failed to add list.'), 'error');
      return false;
    }
  };

  // Handle renaming list
  const handleRenameList = async (listId: string, newName: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('lists')
        .update({ name: newName })
        .eq('id', listId);

      if (error) throw error;

      setLists((prev) =>
        prev.map((l) => (l.id === listId ? { ...l, name: newName } : l))
      );
      showToast('List renamed', 'success');
      return true;
    } catch (err: unknown) {
      showToast(formatSupabaseError(err, 'Failed to rename list.'), 'error');
      return false;
    }
  };

  // Handle deleting list
  const handleConfirmDeleteList = async () => {
    if (!listToDelete) return;
    setIsDeletingList(true);
    try {
      await supabase.from('tasks').delete().eq('list_id', listToDelete.id);

      const { error } = await supabase
        .from('lists')
        .delete()
        .eq('id', listToDelete.id);

      if (error) throw error;

      setLists((prev) => prev.filter((l) => l.id !== listToDelete.id));
      setTasks((prev) => prev.filter((t) => t.list_id !== listToDelete.id));
      showToast(`List "${listToDelete.name}" deleted`, 'success');
      setListToDelete(null);
    } catch (err: unknown) {
      showToast(formatSupabaseError(err, 'Failed to delete list.'), 'error');
    } finally {
      setIsDeletingList(false);
    }
  };

  // Handle adding task inline
  const handleAddTask = async (listId: string, title: string): Promise<boolean> => {
    if (!user || !projectId) return false;

    const tasksInList = tasksByList.get(listId) || [];
    const lastPos =
      tasksInList.length > 0 ? Math.max(...tasksInList.map((t) => t.position)) : 0;
    const newPosition = lastPos + 1000;

    const tempId = `temp-${Date.now()}`;
    const optimisticTask: Task = {
      id: tempId,
      project_id: projectId,
      list_id: listId,
      title,
      description: null,
      assignee_id: null,
      created_by: user.id,
      priority: 'low',
      due_date: null,
      position: newPosition,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      assignee: null,
      comments: [],
    };

    setTasks((prev) => [...prev, optimisticTask]);

    try {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          project_id: projectId,
          list_id: listId,
          title,
          created_by: user.id,
          position: newPosition,
        })
        .select(
          '*, assignee:profiles!tasks_assignee_id_fkey(id, username, display_name, avatar_url), creator:profiles!tasks_created_by_fkey(id, username, display_name, avatar_url), comments(count)'
        )
        .single();

      if (error) throw error;

      setTasks((prev) =>
        prev.map((t) => (t.id === tempId ? (data as Task) : t))
      );
      return true;
    } catch (err: unknown) {
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
      showToast(formatSupabaseError(err, 'Failed to create task.'), 'error');
      return false;
    }
  };

  // 'Project not found' state
  if (notFound) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-xs">
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-slate-400" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1.5">
            Project not found
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed mb-6">
            The project you requested either does not exist, has been removed, or you are not a member of this workspace.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-2xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Projects</span>
          </Link>
        </div>
      </div>
    );
  }

  // Loading Skeletons
  if (loading) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden animate-pulse">
        <div className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="h-4 bg-slate-200 rounded w-48 mb-2" />
          <div className="h-6 bg-slate-200 rounded w-72 mb-1.5" />
          <div className="h-3.5 bg-slate-100 rounded w-96" />
        </div>

        <div className="flex-1 overflow-x-auto p-6 bg-slate-100/70">
          <div className="flex items-start gap-4 min-w-max">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-[280px] shrink-0 bg-slate-100 rounded-xl border border-slate-200 p-3 h-96 flex flex-col gap-3"
              >
                <div className="h-5 bg-slate-200 rounded w-1/2 mb-1" />
                <div className="h-20 bg-white rounded-lg border border-slate-200" />
                <div className="h-24 bg-white rounded-lg border border-slate-200" />
                <div className="h-16 bg-white rounded-lg border border-slate-200" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Board Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-3.5 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Breadcrumb Trail */}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Link
              to="/"
              className="hover:text-slate-900 transition-colors flex items-center gap-1 font-medium"
            >
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span>Projects</span>
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-slate-900 truncate max-w-[260px]">
              {project?.name}
            </span>
          </div>

          {/* Header Controls */}
          <div className="flex items-center gap-2.5 sm:gap-3 text-xs text-slate-500">
            {/* Member Avatars */}
            {detailedMembers.length > 0 && (
              <div className="flex items-center -space-x-1.5 overflow-hidden">
                {detailedMembers.slice(0, 4).map((m) => {
                  const initials = (m.profile.display_name || m.profile.username)
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0].toUpperCase())
                    .join('') || m.profile.username.slice(0, 2).toUpperCase();

                  return (
                    <div
                      key={m.user_id}
                      className="w-7 h-7 rounded-full bg-slate-800 text-white ring-2 ring-white flex items-center justify-center text-[10px] font-bold overflow-hidden shadow-2xs"
                      title={`${m.profile.display_name || m.profile.username} (@${m.profile.username}) · ${m.role}`}
                    >
                      {m.profile.avatar_url ? (
                        <img
                          src={m.profile.avatar_url}
                          alt={m.profile.username}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span>{initials}</span>
                      )}
                    </div>
                  );
                })}
                {detailedMembers.length > 4 && (
                  <div
                    className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 ring-2 ring-white flex items-center justify-center text-[10px] font-bold font-mono"
                    title={`${detailedMembers.length - 4} more members`}
                  >
                    +{detailedMembers.length - 4}
                  </div>
                )}
              </div>
            )}

            {/* Members Button */}
            <button
              type="button"
              onClick={() => setIsMembersModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer shadow-2xs"
              title="View and manage members"
            >
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span>Members</span>
              <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                {detailedMembers.length}
              </span>
            </button>

            {project?.created_at && (
              <div className="hidden lg:flex items-center gap-1.5 text-slate-400">
                <Calendar className="w-3.5 h-3.5" />
                <span>
                  Created {new Date(project.created_at).toLocaleDateString()}
                </span>
              </div>
            )}
            {/* Realtime Live Indicator */}
            {realtimeStatus === 'live' ? (
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[11px] font-medium shrink-0 select-none"
                title="Real-time synchronization active"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Live</span>
              </div>
            ) : (
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200/80 text-[11px] font-medium shrink-0 select-none"
                title="Reconnecting to real-time synchronization..."
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                <span>Reconnecting...</span>
              </div>
            )}

            <button
              type="button"
              onClick={loadBoardData}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
              title="Refresh board"
              aria-label="Refresh board"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Project Title & Description */}
        <div className="mt-2">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            {project?.name}
          </h1>
          {project?.description && (
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              {project.description}
            </p>
          )}
        </div>
      </div>

      {/* Drag and Drop Context */}
      <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {/* Horizontal Scrolling Board Columns Canvas */}
        <div className="flex-1 overflow-x-auto p-4 sm:p-6 bg-slate-100/70">
          <Droppable droppableId="board-columns" direction="horizontal" type="COLUMN">
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`flex items-start gap-4 min-w-max pb-6 rounded-xl transition-colors ${
                  snapshot.isDraggingOver ? 'bg-slate-200/40' : ''
                }`}
              >
                {lists.map((list, index) => {
                  const listTasks = tasksByList.get(list.id) || [];
                  return (
                    <Draggable
                      key={list.id}
                      draggableId={`list-${list.id}`}
                      index={index}
                    >
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`w-[280px] shrink-0 transition-shadow ${
                            snapshot.isDragging
                              ? 'shadow-2xl opacity-90 ring-2 ring-blue-500 rounded-xl z-40'
                              : ''
                          }`}
                        >
                          <ListColumn
                            list={list}
                            tasks={listTasks}
                            columnDragHandleProps={provided.dragHandleProps}
                            onSelectTask={handleSelectTask}
                            onAddTask={handleAddTask}
                            onRenameList={handleRenameList}
                            onDeleteListRequest={(l) => setListToDelete(l)}
                          />
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}

                {/* Add List Form at end of the board */}
                <AddListForm onAddList={handleAddList} />
              </div>
            )}
          </Droppable>
        </div>
      </DragDropContext>

      {/* Task Details Modal */}
      {activeTask && (
        <TaskModal
          task={activeTask}
          listName={activeTaskList?.name}
          members={members}
          onClose={handleCloseTaskModal}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
        />
      )}

      {/* Delete List Confirmation Modal */}
      <DeleteListModal
        list={listToDelete}
        taskCount={listToDelete ? (tasksByList.get(listToDelete.id) || []).length : 0}
        isDeleting={isDeletingList}
        onConfirm={handleConfirmDeleteList}
        onCancel={() => setListToDelete(null)}
      />

      {/* Project Members & Settings Modal */}
      {project && (
        <MembersModal
          isOpen={isMembersModalOpen}
          onClose={() => setIsMembersModalOpen(false)}
          project={project}
          members={detailedMembers}
          currentUserRole={currentUserRole}
          onMembersUpdated={loadBoardData}
        />
      )}
    </div>
  );
};
