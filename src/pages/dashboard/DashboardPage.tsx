import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient.ts';
import { NewProjectModal } from '../../components/projects/NewProjectModal.tsx';
import { formatSupabaseError } from '../../lib/errorHandler.ts';
import type { Project } from '../../types/database.ts';
import {
  Plus,
  Search,
  Users,
  Calendar,
  FolderKanban,
  ArrowUpRight,
  RefreshCw,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce search query to prevent unnecessary re-filtering on rapid keystrokes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('projects')
        .select('*, project_members(count)')
        .order('created_at', { ascending: false });

      if (fetchErr) {
        setError(formatSupabaseError(fetchErr, 'Failed to load projects.'));
      } else {
        setProjects((data as Project[]) || []);
      }
    } catch (err: unknown) {
      setError(formatSupabaseError(err, 'Unable to connect to database.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const filteredProjects = useMemo(() => {
    const q = debouncedQuery.toLowerCase().trim();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
    );
  }, [projects, debouncedQuery]);

  const formatMemberCount = (project: Project): number => {
    if (Array.isArray(project.project_members)) {
      return project.project_members[0]?.count ?? 1;
    }
    if (
      project.project_members &&
      typeof project.project_members === 'object' &&
      'count' in project.project_members
    ) {
      return (project.project_members as { count: number }).count;
    }
    return 1;
  };

  const formatDate = (isoString: string): string => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'Recently';
    }
  };

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Projects
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage your visual taskboards, team workflows, and ongoing sprints
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={fetchProjects}
            disabled={loading}
            className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors disabled:opacity-50"
            title="Refresh projects"
            aria-label="Refresh projects"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New project</span>
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects by name or description..."
            className="w-full pl-9 pr-4 py-2 bg-white rounded-lg border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          />
        </div>
        <div className="text-xs text-slate-500 flex items-center gap-1.5 self-end sm:self-center font-mono tabular-nums">
          <span>{filteredProjects.length}</span>
          <span>{filteredProjects.length === 1 ? 'project' : 'projects'}</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="mt-6">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between">
            <p>Error loading projects: {error}</p>
            <button
              onClick={fetchProjects}
              className="text-xs font-semibold text-rose-700 underline hover:text-rose-900"
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          /* Loading Skeletons */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3, 4, 5, 6].map((idx) => (
              <div
                key={idx}
                className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse flex flex-col justify-between h-44"
              >
                <div>
                  <div className="h-5 bg-slate-200 rounded-md w-3/4 mb-3" />
                  <div className="h-3.5 bg-slate-100 rounded-md w-full mb-2" />
                  <div className="h-3.5 bg-slate-100 rounded-md w-4/5" />
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <div className="h-3 bg-slate-100 rounded w-20" />
                  <div className="h-3 bg-slate-100 rounded w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-2xl border border-slate-200 border-dashed p-12 text-center max-w-xl mx-auto my-8">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
              <FolderKanban className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">
              {searchQuery ? 'No matching projects found' : 'No projects yet'}
            </h3>
            <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
              {searchQuery
                ? `No projects matched "${searchQuery}". Try a different search term or clear the filter.`
                : 'Get started by creating your first project workspace. Boards come pre-configured with To Do, In Progress, and Done lists.'}
            </p>
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Clear search
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 active:bg-blue-800 shadow-sm transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create your first project</span>
              </button>
            )}
          </div>
        ) : (
          /* Project Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredProjects.map((project) => {
              const memberCount = formatMemberCount(project);
              return (
                <Link
                  key={project.id}
                  to={`/p/${project.id}`}
                  className="group bg-white rounded-xl border border-slate-200 hover:border-blue-400/80 hover:shadow-md transition-all p-5 flex flex-col justify-between min-h-[170px]"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-base font-semibold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                        {project.name}
                      </h2>
                      <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0 mt-0.5" />
                    </div>
                    {project.description ? (
                      <p className="text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed">
                        {project.description}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 italic mt-2">
                        No description provided
                      </p>
                    )}
                  </div>

                  {/* Clean unboxed metadata footer with separators */}
                  <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span className="tabular-nums">
                        {memberCount} {memberCount === 1 ? 'member' : 'members'}
                      </span>
                    </div>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{formatDate(project.created_at)}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* New Project Modal */}
      <NewProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onProjectCreated={(newProject) => {
          setProjects((prev) => [newProject, ...prev]);
        }}
      />
    </div>
  );
};
