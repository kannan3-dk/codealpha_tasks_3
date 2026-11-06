import React from 'react';
import type { Task } from '../../types/database.ts';
import { MessageSquare, Calendar, AlertCircle } from 'lucide-react';

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, onClick }) => {
  // Extract comment count
  const commentCount = Array.isArray(task.comments)
    ? task.comments[0]?.count ?? 0
    : (task.comments as { count: number } | undefined)?.count ?? 0;

  // Due date formatting and overdue check
  let formattedDueDate: string | null = null;
  let isOverdue = false;

  if (task.due_date) {
    try {
      const due = new Date(task.due_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Overdue if due date timestamp is strictly before the beginning of today
      const dueDay = new Date(due);
      dueDay.setHours(0, 0, 0, 0);
      isOverdue = dueDay.getTime() < today.getTime();

      formattedDueDate = due.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      formattedDueDate = null;
    }
  }

  // Assignee initials & name
  const assigneeName = task.assignee?.display_name || task.assignee?.username;
  const assigneeInitials = assigneeName
    ? assigneeName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join('') || assigneeName.slice(0, 2).toUpperCase()
    : null;

  // Priority badge styling
  const priorityStyles = {
    high: 'text-rose-700 bg-rose-50 border-rose-200/80',
    medium: 'text-amber-700 bg-amber-50 border-amber-200/80',
    low: 'text-slate-600 bg-slate-100 border-slate-200',
  };

  const priorityLabel = {
    high: 'High',
    medium: 'Medium',
    low: 'Low',
  };

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      className="bg-white rounded-lg p-3 border border-slate-200/90 shadow-2xs hover:border-blue-300 hover:shadow-xs transition-all select-none group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {/* Top row: Priority Badge */}
      {task.priority && (
        <div className="mb-2">
          <span
            className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded border ${
              priorityStyles[task.priority] || priorityStyles.low
            }`}
          >
            {priorityLabel[task.priority] || task.priority}
          </span>
        </div>
      )}

      {/* Task Title */}
      <h4 className="text-sm font-medium text-slate-800 leading-snug break-words">
        {task.title}
      </h4>

      {/* Description preview if present */}
      {task.description && (
        <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
          {task.description}
        </p>
      )}

      {/* Bottom Metadata: Due date, comments, assignee avatar */}
      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-500">
        <div className="flex items-center gap-3">
          {/* Due date */}
          {formattedDueDate && (
            <div
              className={`flex items-center gap-1 text-[11px] font-medium ${
                isOverdue
                  ? 'text-rose-600 font-semibold'
                  : 'text-slate-500'
              }`}
              title={isOverdue ? 'Overdue' : 'Due date'}
            >
              {isOverdue ? (
                <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              ) : (
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
              <span>{formattedDueDate}</span>
            </div>
          )}

          {/* Comment count */}
          {commentCount > 0 && (
            <div
              className="flex items-center gap-1 text-[11px] text-slate-500 font-mono tabular-nums"
              title={`${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{commentCount}</span>
            </div>
          )}
        </div>

        {/* Assignee Avatar */}
        {task.assignee ? (
          <div
            className="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold shrink-0 shadow-2xs overflow-hidden"
            title={`Assigned to ${assigneeName || 'user'}`}
          >
            {task.assignee.avatar_url ? (
              <img
                src={task.assignee.avatar_url}
                alt={assigneeName || 'Assignee'}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span>{assigneeInitials}</span>
            )}
          </div>
        ) : (
          <div className="w-6 h-6" />
        )}
      </div>
    </div>
  );
};
