import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useToast } from '../../contexts/ToastContext.tsx';
import { formatSupabaseError } from '../../lib/errorHandler.ts';
import type { TaskWithProject } from '../../types/database.ts';
import {
  CheckSquare,
  Calendar,
  AlertCircle,
  ExternalLink,
  Layers,
  RefreshCw,
  FolderKanban,
  CheckCircle2,
  Clock,
} from 'lucide-react';

export const MyTasksPage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [tasks, setTasks] = useState<TaskWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [hideDone, setHideDone] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMyTasks = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*, project:projects(id, name), list:lists(id, name)')
        .eq('assignee_id', user.id)
        .order('due_date', { ascending: true, nullsFirst: false });

      if (error) {
        showToast(formatSupabaseError(error, 'Failed to load assigned tasks.'), 'error');
      } else {
        setTasks((data as TaskWithProject[]) || []);
      }
    } catch (err: unknown) {
      showToast(formatSupabaseError(err, 'Unable to fetch tasks.'), 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, showToast]);

  useEffect(() => {
    fetchMyTasks();
  }, [fetchMyTasks]);

  // Filter tasks if hideDone is enabled
  const filteredTasks = useMemo(() => {
    if (!hideDone) return tasks;
    return tasks.filter((t) => t.list?.name?.toLowerCase() !== 'done');
  }, [tasks, hideDone]);

  // Group tasks by project
  const tasksByProject = useMemo(() => {
    const map = new Map<string, { projectName: string; tasks: TaskWithProject[] }>();

    for (const task of filteredTasks) {
      const projectId = task.project_id || task.project?.id || 'unknown';
      const projectName = task.project?.name || 'Untitled Project';

      const existing = map.get(projectId);
      if (existing) {
        existing.tasks.push(task);
      } else {
        map.set(projectId, { projectName, tasks: [task] });
      }
    }

    return Array.from(map.entries()).map(([projectId, group]) => ({
      projectId,
      projectName: group.projectName,
      tasks: group.tasks,
    }));
  }, [filteredTasks]);

  // Priority styles
  const priorityStyles = {
    high: 'text-rose-700 bg-rose-50 border-rose-200/80',
    medium: 'text-amber-700 bg-amber-50 border-amber-200/80',
    low: 'text-slate-600 bg-slate-100 border-slate-200',
  };

  // Due date format and overdue check
  const formatDueDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      const due = new Date(dateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const dueDay = new Date(due);
      dueDay.setHours(0, 0, 0, 0);
      const isOverdue = dueDay.getTime() < today.getTime();

      const text = due.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });

      return { text, isOverdue };
    } catch {
      return null;
    }
  };

  return (
    <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            My Tasks
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Overview of all tasks assigned to you across projects
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Hide Done Tasks Toggle */}
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors shadow-2xs select-none">
            <input
              type="checkbox"
              checked={hideDone}
              onChange={(e) => setHideDone(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span>Hide tasks in Done</span>
          </label>

          <button
            type="button"
            onClick={fetchMyTasks}
            disabled={refreshing}
            className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
            title="Refresh tasks"
            aria-label="Refresh tasks"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="mt-6">
        {loading ? (
          /* Skeletons */
          <div className="space-y-6 animate-pulse">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="h-5 bg-slate-200 rounded w-48 mb-4" />
                <div className="space-y-2.5">
                  <div className="h-14 bg-slate-50 rounded-lg border border-slate-100" />
                  <div className="h-14 bg-slate-50 rounded-lg border border-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : tasks.length === 0 ? (
          /* Empty state: No assigned tasks */
          <div className="bg-white rounded-2xl border border-slate-200 border-dashed p-12 text-center max-w-lg mx-auto my-10">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
              <CheckSquare className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">
              No tasks assigned to you
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-6 leading-relaxed">
              When team members assign tasks to your username in any project, they will appear here grouped by project with their deadlines.
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-2xs"
            >
              <Layers className="w-4 h-4" />
              <span>Browse Projects</span>
            </Link>
          </div>
        ) : filteredTasks.length === 0 ? (
          /* Filtered state: All tasks in Done */
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-md mx-auto my-8">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">
              All assigned tasks are in &quot;Done&quot;
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              You have completed all your tasks! Turn off the filter above to view finished work.
            </p>
            <button
              type="button"
              onClick={() => setHideDone(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Show all tasks
            </button>
          </div>
        ) : (
          /* Tasks Grouped by Project */
          <div className="space-y-6">
            {tasksByProject.map((group) => (
              <div
                key={group.projectId}
                className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden"
              >
                {/* Project Group Header */}
                <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FolderKanban className="w-4 h-4 text-blue-600 shrink-0" />
                    <h2 className="text-sm font-bold text-slate-900 truncate">
                      {group.projectName}
                    </h2>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 bg-white border border-slate-200 px-2 py-0.2 rounded-full">
                      {group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'}
                    </span>
                  </div>

                  <Link
                    to={`/p/${group.projectId}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors shrink-0"
                  >
                    <span>Open board</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>

                {/* Tasks List */}
                <div className="divide-y divide-slate-100">
                  {group.tasks.map((task) => {
                    const dueInfo = formatDueDate(task.due_date);
                    const isDone = task.list?.name?.toLowerCase() === 'done';

                    return (
                      <Link
                        key={task.id}
                        to={`/p/${task.project_id}?task=${task.id}`}
                        className="group p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-slate-50/90 transition-colors block"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-xs font-semibold text-slate-900 group-hover:text-blue-600 transition-colors leading-snug line-clamp-1">
                              {task.title}
                            </h3>
                          </div>
                          {task.description && (
                            <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                              {task.description}
                            </p>
                          )}
                        </div>

                        {/* Badges: Priority, Due Date, List Name */}
                        <div className="flex items-center gap-3 shrink-0 self-start sm:self-center text-xs">
                          {/* List Name Badge */}
                          {task.list?.name && (
                            <span
                              className={`text-[11px] font-medium px-2 py-0.5 rounded border ${
                                isDone
                                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                  : 'text-slate-600 bg-slate-50 border-slate-200'
                              }`}
                            >
                              {task.list.name}
                            </span>
                          )}

                          {/* Priority Badge */}
                          {task.priority && (
                            <span
                              className={`text-[11px] font-medium px-2 py-0.5 rounded border capitalize ${
                                priorityStyles[task.priority] || priorityStyles.low
                              }`}
                            >
                              {task.priority}
                            </span>
                          )}

                          {/* Due Date */}
                          {dueInfo ? (
                            <div
                              className={`flex items-center gap-1 text-[11px] font-medium ${
                                dueInfo.isOverdue
                                  ? 'text-rose-600 font-semibold'
                                  : 'text-slate-500'
                              }`}
                              title={dueInfo.isOverdue ? 'Overdue' : 'Due date'}
                            >
                              {dueInfo.isOverdue ? (
                                <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                              ) : (
                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              )}
                              <span>{dueInfo.text}</span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-300" />
                              <span>No date</span>
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
