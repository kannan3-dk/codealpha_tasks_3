import React, { useState, useRef, useEffect } from 'react';
import type { List, Task } from '../../types/database.ts';
import { TaskCard } from './TaskCard.tsx';
import { Droppable, Draggable, type DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import {
  MoreHorizontal,
  Plus,
  X,
  Edit2,
  Trash2,
  Check,
  Loader2,
  Inbox,
  GripVertical,
} from 'lucide-react';

interface ListColumnProps {
  list: List;
  tasks: Task[];
  columnDragHandleProps?: DraggableProvidedDragHandleProps | null;
  onSelectTask: (task: Task) => void;
  onAddTask: (listId: string, title: string) => Promise<boolean>;
  onRenameList: (listId: string, newName: string) => Promise<boolean>;
  onDeleteListRequest: (list: List) => void;
}

export const ListColumn: React.FC<ListColumnProps> = ({
  list,
  tasks,
  columnDragHandleProps,
  onSelectTask,
  onAddTask,
  onRenameList,
  onDeleteListRequest,
}) => {
  // Rename state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(list.name);
  const [isRenaming, setIsRenaming] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Add task inline form state
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const taskInputRef = useRef<HTMLTextAreaElement>(null);

  // Options menu dropdown state
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditedName(list.name);
  }, [list.name]);

  useEffect(() => {
    if (isEditingName && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isEditingName]);

  useEffect(() => {
    if (isAddingTask && taskInputRef.current) {
      taskInputRef.current.focus();
    }
  }, [isAddingTask]);

  // Click outside to close dropdown menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  const handleSaveRename = async () => {
    const trimmed = editedName.trim();
    if (!trimmed || trimmed === list.name) {
      setIsEditingName(false);
      setEditedName(list.name);
      return;
    }
    setIsRenaming(true);
    const success = await onRenameList(list.id, trimmed);
    setIsRenaming(false);
    if (success) {
      setIsEditingName(false);
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveRename();
    } else if (e.key === 'Escape') {
      setIsEditingName(false);
      setEditedName(list.name);
    }
  };

  const handleCreateTask = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanTitle = taskTitle.trim();
    if (!cleanTitle) return;

    setIsSubmittingTask(true);
    const success = await onAddTask(list.id, cleanTitle);
    setIsSubmittingTask(false);

    if (success) {
      setTaskTitle('');
      setTimeout(() => {
        taskInputRef.current?.focus();
      }, 50);
    }
  };

  const handleTaskKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCreateTask();
    } else if (e.key === 'Escape') {
      setIsAddingTask(false);
      setTaskTitle('');
    }
  };

  return (
    <div className="w-[280px] shrink-0 bg-slate-100/90 rounded-xl border border-slate-200/90 p-3 shadow-2xs flex flex-col max-h-[calc(100vh-200px)]">
      {/* List Header */}
      <div className="flex items-center justify-between gap-1.5 px-1 py-1 mb-2">
        {/* Grip handle for reordering column horizontally */}
        <div
          {...columnDragHandleProps}
          className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
          title="Drag to reorder list"
          aria-label="Drag list handle"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>

        {isEditingName ? (
          <div className="flex items-center gap-1.5 flex-1">
            <input
              ref={renameInputRef}
              type="text"
              value={editedName}
              disabled={isRenaming}
              onChange={(e) => setEditedName(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              className="w-full px-2 py-1 text-xs font-semibold bg-white rounded border border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800"
            />
            <button
              type="button"
              onClick={handleSaveRename}
              disabled={isRenaming || !editedName.trim()}
              className="p-1 rounded text-emerald-600 hover:bg-emerald-50 transition-colors"
              aria-label="Save list name"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setIsEditingName(false);
                setEditedName(list.name);
              }}
              className="p-1 rounded text-slate-400 hover:bg-slate-200 transition-colors"
              aria-label="Cancel rename"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <h3
              onClick={() => setIsEditingName(true)}
              className="text-xs font-bold text-slate-800 uppercase tracking-wider truncate cursor-pointer hover:text-blue-600 transition-colors py-0.5"
              title="Click to rename"
            >
              {list.name}
            </h3>
            <span className="text-[11px] font-mono tabular-nums text-slate-400 bg-slate-200/70 px-1.5 py-0.5 rounded text-center shrink-0">
              {tasks.length}
            </span>
          </div>
        )}

        {/* Options Menu Dropdown */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 transition-colors cursor-pointer"
            aria-label="List options"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-30 animate-in fade-in duration-100">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setIsEditingName(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 transition-colors text-left cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                <span>Rename list</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setIsAddingTask(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 transition-colors text-left cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-slate-400" />
                <span>Add task</span>
              </button>
              <div className="border-t border-slate-100 my-1" />
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDeleteListRequest(list);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors text-left cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                <span>Delete list</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Task Cards Droppable Container */}
      <Droppable droppableId={list.id} type="TASK">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 overflow-y-auto space-y-2 py-1 min-h-[50px] pr-0.5 rounded-lg transition-colors ${
              snapshot.isDraggingOver
                ? 'bg-blue-50/70 ring-2 ring-blue-300 ring-dashed p-1'
                : ''
            }`}
          >
            {tasks.map((task, index) => (
              <Draggable key={task.id} draggableId={task.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={`transition-shadow ${
                      snapshot.isDragging
                        ? 'opacity-95 shadow-xl rotate-[1deg] ring-2 ring-blue-500 rounded-lg z-50'
                        : ''
                    }`}
                  >
                    <TaskCard
                      task={task}
                      onClick={() => onSelectTask(task)}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}

            {tasks.length === 0 && !isAddingTask && !snapshot.isDraggingOver && (
              <div className="border border-dashed border-slate-300/80 rounded-lg py-7 px-3 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-1.5 bg-white/30">
                <Inbox className="w-4 h-4 text-slate-300" />
                <span className="text-[11px] text-slate-400">No tasks in this list</span>
              </div>
            )}
          </div>
        )}
      </Droppable>

      {/* Add Task Form / Button at bottom */}
      <div className="mt-2 pt-1 shrink-0">
        {isAddingTask ? (
          <form onSubmit={handleCreateTask} className="space-y-2">
            <textarea
              ref={taskInputRef}
              rows={2}
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              onKeyDown={handleTaskKeyDown}
              placeholder="Enter a title for this card..."
              className="w-full p-2 text-xs text-slate-800 bg-white rounded-lg border border-slate-300 shadow-2xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={isSubmittingTask || !taskTitle.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs transition-colors cursor-pointer"
              >
                {isSubmittingTask ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Adding...</span>
                  </>
                ) : (
                  <span>Add card</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddingTask(false);
                  setTaskTitle('');
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                aria-label="Cancel adding card"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setIsAddingTask(true)}
            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 transition-colors text-left cursor-pointer"
          >
            <Plus className="w-4 h-4 text-slate-500" />
            <span>Add a card</span>
          </button>
        )}
      </div>
    </div>
  );
};
