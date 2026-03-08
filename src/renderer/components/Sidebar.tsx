import {
  Archive,
  ChevronDown,
  ChevronRight,
  Clock,
  FolderOpen,
  Globe,
  Info,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  SquarePen,
  Timer,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AppInfo, Conversation, Project, ScheduledTask } from '@/electron';

import AppPanel from './AppPanel';
import FileTree from './FileTree';

const truncateText = (text: string, maxLength: number = 60) => {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
};

interface SidebarProps {
  onLoadConversation: (conversationId: string) => void;
  currentConversationId: string | null;
  onNewChat: () => void | Promise<void>;
  onFileSelect: (path: string) => void;
  selectedFilePath: string | null;
  onFileDeleted?: (path: string, isDirectory: boolean) => void;
  onSettingsClick?: () => void;
  onSkillsClick?: () => void;
  onSchedulesClick?: () => void;
  onOpenDbViewer?: (appId: string, appName: string) => void;
  onOnboardingClick?: () => void;
}

export default function Sidebar({
  onLoadConversation,
  currentConversationId,
  onNewChat,
  onFileSelect,
  selectedFilePath,
  onFileDeleted,
  onSettingsClick,
  onSkillsClick,
  onSchedulesClick,
  onOpenDbViewer,
  onOnboardingClick,
}: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [isSchedulesCollapsed, setIsSchedulesCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-schedules-collapsed') !== 'false';
    } catch {
      return true;
    }
  });
  const [isAppsCollapsed, setIsAppsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-apps-collapsed') !== 'false';
    } catch {
      return true;
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isProjectsCollapsed, setIsProjectsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-projects-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [isTasksCollapsed, setIsTasksCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-tasks-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [isFilesCollapsed, setIsFilesCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-files-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('sidebar-collapsed-projects');
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    projectId: string;
  } | null>(null);
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null);
  const [dragOverUngrouped, setDragOverUngrouped] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const newProjectInputRef = useRef<HTMLInputElement>(null);
  const editProjectInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  const relativeTimeFormatter = useMemo(
    () => new Intl.RelativeTimeFormat(undefined, { numeric: 'always' }),
    []
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [convResponse, projResponse, schedResponse, appResponse] = await Promise.all([
        window.electron.conversation.list(),
        window.electron.project.list(),
        window.electron.schedule.list(),
        window.electron.app.scan(),
      ]);
      if (convResponse.success && convResponse.conversations) {
        setConversations(convResponse.conversations);
      }
      if (projResponse.success && projResponse.projects) {
        setProjects(projResponse.projects);
      }
      if (schedResponse.success && schedResponse.tasks) {
        setScheduledTasks(schedResponse.tasks);
      }
      if (appResponse.success) {
        setApps(appResponse.apps);
      }
    } catch (error) {
      console.error('Error loading sidebar data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (currentConversationId) loadData();
  }, [currentConversationId, loadData]);

  const refreshApps = useCallback(async () => {
    try {
      const response = await window.electron.app.scan();
      if (response.success) {
        setApps(response.apps);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Refresh apps periodically
  useEffect(() => {
    const timer = setInterval(refreshApps, 3000);
    return () => clearInterval(timer);
  }, [refreshApps]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  const handleDelete = async (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    try {
      const response = await window.electron.conversation.delete(conversationId);
      if (response.success) {
        await loadData();
        if (conversationId === currentConversationId) await onNewChat();
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  };

  const handleCreateProject = async () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    const name = newProjectName.trim();
    if (!name) {
      setCreatingProject(false);
      setNewProjectName('');
      return;
    }
    try {
      await window.electron.project.create(name);
      await loadData();
    } catch (error) {
      console.error('Error creating project:', error);
    }
    setCreatingProject(false);
    setNewProjectName('');
  };

  const handleRenameProject = async () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    if (!editingProjectId) return;
    const name = editingProjectName.trim();
    if (!name) {
      setEditingProjectId(null);
      return;
    }
    try {
      await window.electron.project.update(editingProjectId, { name });
      await loadData();
    } catch (error) {
      console.error('Error renaming project:', error);
    }
    setEditingProjectId(null);
  };

  const handleArchiveProject = async (projectId: string) => {
    try {
      await window.electron.project.update(projectId, { isArchived: true });
      await loadData();
    } catch (error) {
      console.error('Error archiving project:', error);
    }
  };

  const handleDragStart = (e: React.DragEvent, conversationId: string) => {
    e.dataTransfer.setData('text/plain', conversationId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDropOnProject = async (e: React.DragEvent, projectId: string) => {
    e.preventDefault();
    setDragOverProjectId(null);
    const conversationId = e.dataTransfer.getData('text/plain');
    if (!conversationId) return;
    try {
      await window.electron.conversation.setProject(conversationId, projectId);
      await loadData();
    } catch (error) {
      console.error('Error moving conversation to project:', error);
    }
  };

  const handleDropOnUngrouped = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverUngrouped(false);
    const conversationId = e.dataTransfer.getData('text/plain');
    if (!conversationId) return;
    try {
      await window.electron.conversation.setProject(conversationId, null);
      await loadData();
    } catch (error) {
      console.error('Error removing conversation from project:', error);
    }
  };

  const toggleProjectCollapsed = (projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      try {
        localStorage.setItem('sidebar-collapsed-projects', JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const conversationPreviews = useMemo(() => {
    return conversations.reduce<Record<string, string>>((acc, conversation) => {
      try {
        const parsed = JSON.parse(conversation.messages) as Array<{
          role: string;
          content: string | { type: string; text?: string }[];
        }>;
        let preview = '';
        for (let i = parsed.length - 1; i >= 0; i--) {
          if (parsed[i].role !== 'assistant') continue;
          const content = parsed[i].content;
          if (typeof content === 'string') {
            preview = truncateText(content);
            break;
          }
          if (Array.isArray(content)) {
            const textBlock = content.findLast(
              (block) =>
                typeof block === 'object' && block !== null && block.type === 'text' && 'text' in block
            );
            if (
              textBlock &&
              typeof textBlock === 'object' &&
              'text' in textBlock &&
              typeof textBlock.text === 'string'
            ) {
              preview = truncateText(textBlock.text);
              break;
            }
          }
        }
        acc[conversation.id] = preview;
      } catch {
        acc[conversation.id] = '';
      }
      acc[conversation.id] = acc[conversation.id] || '继续任务...';
      return acc;
    }, {});
  }, [conversations]);

  const formatRelativeDate = useCallback(
    (timestamp: number) => {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return '';

      const diffMs = Date.now() - date.getTime();
      const diffMinutes = Math.floor(diffMs / (1000 * 60));

      if (diffMinutes < 60) {
        return relativeTimeFormatter.format(-Math.max(1, diffMinutes), 'minute');
      }
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) {
        return relativeTimeFormatter.format(-diffHours, 'hour');
      }
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) {
        return relativeTimeFormatter.format(-diffDays, 'day');
      }
      if (diffDays < 30) {
        return relativeTimeFormatter.format(-Math.floor(diffDays / 7), 'week');
      }
      const months = Math.floor(diffDays / 30);
      if (months < 12) {
        return relativeTimeFormatter.format(-months, 'month');
      }
      return relativeTimeFormatter.format(-Math.floor(months / 12), 'year');
    },
    [relativeTimeFormatter]
  );

  const projectIds = useMemo(() => new Set(projects.map((p) => p.id)), [projects]);

  const { grouped, ungrouped } = useMemo(() => {
    const grouped: Record<string, Conversation[]> = {};
    const ungrouped: Conversation[] = [];
    for (const conv of conversations) {
      if (conv.projectId && projectIds.has(conv.projectId)) {
        if (!grouped[conv.projectId]) grouped[conv.projectId] = [];
        grouped[conv.projectId].push(conv);
      } else {
        ungrouped.push(conv);
      }
    }
    return { grouped, ungrouped };
  }, [conversations, projectIds]);

  // Filter by search query
  const filteredUngrouped = useMemo(() => {
    if (!searchQuery.trim()) return ungrouped;
    const q = searchQuery.toLowerCase();
    return ungrouped.filter(
      (conv) =>
        conv.title.toLowerCase().includes(q) ||
        (conversationPreviews[conv.id] ?? '').toLowerCase().includes(q)
    );
  }, [ungrouped, searchQuery, conversationPreviews]);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter((project) => {
      if (project.name.toLowerCase().includes(q)) return true;
      const projectConvs = grouped[project.id] ?? [];
      return projectConvs.some(
        (conv) =>
          conv.title.toLowerCase().includes(q) ||
          (conversationPreviews[conv.id] ?? '').toLowerCase().includes(q)
      );
    });
  }, [projects, searchQuery, grouped, conversationPreviews]);

  const filteredScheduledTasks = useMemo(() => {
    if (!searchQuery.trim()) return scheduledTasks;
    const q = searchQuery.toLowerCase();
    return scheduledTasks.filter((task) => task.name.toLowerCase().includes(q));
  }, [scheduledTasks, searchQuery]);

  const filteredApps = useMemo(() => {
    if (!searchQuery.trim()) return apps;
    const q = searchQuery.toLowerCase();
    return apps.filter((app) => app.name.toLowerCase().includes(q));
  }, [apps, searchQuery]);

  const renderConversationItem = (conversation: Conversation) => {
    const isActive = conversation.id === currentConversationId;
    return (
      <div
        key={conversation.id}
        draggable
        onDragStart={(e) => handleDragStart(e, conversation.id)}
        onClick={() => onLoadConversation(conversation.id)}
        className={`group mb-0.5 cursor-pointer rounded-lg px-2.5 py-2 transition-colors ${
          isActive
            ? 'bg-white shadow-sm dark:bg-neutral-800'
            : 'hover:bg-white/60 dark:hover:bg-neutral-800/50'
        }`}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] leading-tight text-neutral-800 dark:text-neutral-200">
              {conversation.title}
            </div>
            <div className="mt-1 flex items-center gap-1 text-[10px] text-neutral-400 dark:text-neutral-500">
              <Clock className="h-2.5 w-2.5" />
              <span>{formatRelativeDate(conversation.updatedAt)}</span>
            </div>
          </div>
          <button
            onClick={(e) => handleDelete(e, conversation.id)}
            className="shrink-0 rounded p-0.5 text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500 dark:text-neutral-600 dark:hover:text-red-400"
            aria-label="删除任务"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col border-r" style={{ borderColor: 'var(--color-sidebar-border)', background: 'var(--color-sidebar-bg)', backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)' }}>
      {/* Drag region for macOS traffic lights */}
      <div className="shrink-0 [-webkit-app-region:drag]" style={{ height: 'var(--titlebar-height)' }} />

      {/* Brand */}
      <div className="shrink-0 px-4 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl" role="img" aria-label="horse">
            🐴
          </span>
          <span className="text-base font-bold text-neutral-800 select-none dark:text-neutral-100">
            小马快跑
          </span>
          <button
            onClick={onOnboardingClick}
            className="ml-auto rounded-full p-1 text-neutral-300 transition hover:bg-neutral-200/60 hover:text-neutral-500 dark:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-400"
            title="新手引导"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* === Primary Action: 新建任务 === */}
      <div className="shrink-0 px-3 pb-2">
        <button
          onClick={() => onNewChat()}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-200/70 active:bg-neutral-200 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:active:bg-neutral-700"
        >
          <SquarePen className="h-4 w-4" />
          新建任务
        </button>
      </div>

      {/* === Nav links === */}
      <div className="shrink-0 space-y-0.5 px-3 pb-3">
        <button
          onClick={onSkillsClick}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-200/70 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <Sparkles className="h-4 w-4" />
          Skill 精选
        </button>
        <button
          onClick={onSchedulesClick}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-200/70 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <Timer className="h-4 w-4" />
          定时任务
          {scheduledTasks.length > 0 && (
            <span className="ml-auto text-[10px] text-neutral-400 dark:text-neutral-500">
              {scheduledTasks.filter((t) => t.enabled).length}/{scheduledTasks.length}
            </span>
          )}
        </button>
      </div>

      {/* === Scrollable content area === */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* --- 项目 Section --- */}
        <div className="px-3 pb-1">
          <div className="flex items-center justify-between py-1.5">
            <button
              onClick={() => {
                setIsProjectsCollapsed((prev) => {
                  const next = !prev;
                  try {
                    localStorage.setItem('sidebar-projects-collapsed', String(next));
                  } catch {
                    /* ignore */
                  }
                  return next;
                });
              }}
              className="flex items-center gap-1 text-xs font-semibold text-neutral-400 transition hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
            >
              {isProjectsCollapsed ? (
                <ChevronRight className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              项目
            </button>
            {!isProjectsCollapsed && (
              <button
                onClick={() => {
                  setCreatingProject(true);
                  setTimeout(() => newProjectInputRef.current?.focus(), 0);
                }}
                className="rounded p-0.5 text-neutral-400 transition hover:bg-neutral-200/60 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                title="新建项目"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* New project inline input */}
          {!isProjectsCollapsed && creatingProject && (
            <div className="mb-1 flex items-center gap-2 rounded-lg px-2.5 py-1.5">
              <FolderOpen className="h-4 w-4 shrink-0 text-neutral-400" />
              <input
                ref={newProjectInputRef}
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateProject();
                  if (e.key === 'Escape') {
                    cancelledRef.current = true;
                    setCreatingProject(false);
                    setNewProjectName('');
                  }
                }}
                onBlur={handleCreateProject}
                placeholder="项目名称..."
                className="min-w-0 flex-1 bg-transparent text-sm text-neutral-800 placeholder-neutral-400 outline-none dark:text-neutral-200 dark:placeholder-neutral-500"
              />
            </div>
          )}

          {/* Project list */}
          {!isProjectsCollapsed && filteredProjects.map((project) => {
            const projectConversations = grouped[project.id] ?? [];
            const isCollapsed = collapsedProjects.has(project.id);
            const isDragOver = dragOverProjectId === project.id;
            const isEditing = editingProjectId === project.id;

            const visibleConversations = searchQuery.trim()
              ? projectConversations.filter(
                  (conv) =>
                    conv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (conversationPreviews[conv.id] ?? '').toLowerCase().includes(searchQuery.toLowerCase())
                )
              : projectConversations;

            // When searching, force-expand projects that contain matches
            const shouldShowConversations = searchQuery.trim() ? true : !isCollapsed;

            return (
              <div key={project.id} className="mb-0.5">
                <div
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors ${
                    isDragOver
                      ? 'bg-blue-50 dark:bg-blue-900/20'
                      : 'hover:bg-white/60 dark:hover:bg-neutral-800/50'
                  }`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, projectId: project.id });
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDragOverProjectId(project.id);
                  }}
                  onDragLeave={() => setDragOverProjectId(null)}
                  onDrop={(e) => handleDropOnProject(e, project.id)}
                >
                  <button
                    onClick={() => toggleProjectCollapsed(project.id)}
                    className="shrink-0 text-neutral-400 dark:text-neutral-500"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </button>
                  <FolderOpen className="h-4 w-4 shrink-0 text-neutral-400 dark:text-neutral-500" />
                  {isEditing ? (
                    <input
                      ref={editProjectInputRef}
                      value={editingProjectName}
                      onChange={(e) => setEditingProjectName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameProject();
                        if (e.key === 'Escape') {
                          cancelledRef.current = true;
                          setEditingProjectId(null);
                        }
                      }}
                      onBlur={handleRenameProject}
                      className="min-w-0 flex-1 bg-transparent text-sm text-neutral-800 outline-none dark:text-neutral-200"
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm text-neutral-700 dark:text-neutral-300">
                      {project.name}
                    </span>
                  )}
                </div>

                {shouldShowConversations && visibleConversations.length > 0 && (
                  <div className="ml-4 border-l border-neutral-200/50 pl-2 dark:border-neutral-700/50">
                    {visibleConversations.map(renderConversationItem)}
                  </div>
                )}
              </div>
            );
          })}

          {!isProjectsCollapsed && projects.length === 0 && !creatingProject && (
            <button
              onClick={() => {
                setCreatingProject(true);
                setTimeout(() => newProjectInputRef.current?.focus(), 0);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-neutral-400 transition-colors hover:bg-white/60 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800/50 dark:hover:text-neutral-300"
            >
              <FolderOpen className="h-4 w-4" />
              新项目
            </button>
          )}
        </div>

        {/* --- 所有任务 Section --- */}
        <div className="flex-1 px-3 pt-1">
          <div className="flex items-center justify-between py-1.5">
            <button
              onClick={() => {
                setIsTasksCollapsed((prev) => {
                  const next = !prev;
                  try {
                    localStorage.setItem('sidebar-tasks-collapsed', String(next));
                  } catch {
                    /* ignore */
                  }
                  return next;
                });
              }}
              className="flex items-center gap-1 text-xs font-semibold text-neutral-400 transition hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
            >
              {isTasksCollapsed ? (
                <ChevronRight className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              所有任务
            </button>
            {!isTasksCollapsed && (
              <button
                onClick={() => {
                  setIsSearchOpen((prev) => {
                    if (!prev) setTimeout(() => searchInputRef.current?.focus(), 0);
                    else setSearchQuery('');
                    return !prev;
                  });
                }}
                className={`rounded p-0.5 transition-colors ${
                  isSearchOpen
                    ? 'bg-neutral-200/80 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300'
                    : 'text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300'
                }`}
                title="搜索 / 筛选"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Search input */}
          {!isTasksCollapsed && isSearchOpen && (
            <div className="mb-1.5">
              <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800">
                <Search className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setIsSearchOpen(false);
                      setSearchQuery('');
                    }
                  }}
                  placeholder="搜索任务..."
                  className="min-w-0 flex-1 bg-transparent text-xs text-neutral-800 placeholder-neutral-400 outline-none dark:text-neutral-200 dark:placeholder-neutral-500"
                />
              </div>
            </div>
          )}

          {/* Task list */}
          {!isTasksCollapsed && <div className="pb-2">
            {isLoading ? (
              <div className="py-4 text-center text-xs text-neutral-400">Loading...</div>
            ) : conversations.length === 0 && apps.length === 0 && scheduledTasks.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 py-6 text-center">
                <MessageSquare className="h-5 w-5 text-neutral-300 dark:text-neutral-600" />
                <p className="text-xs text-neutral-400 dark:text-neutral-500">暂无任务</p>
              </div>
            ) : (
              <>
                {/* Ungrouped tasks */}
                {filteredUngrouped.length > 0 && (
                  <div
                    className={dragOverUngrouped ? 'rounded-lg bg-blue-50/50 dark:bg-blue-900/10' : ''}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDragOverUngrouped(true);
                    }}
                    onDragLeave={() => setDragOverUngrouped(false)}
                    onDrop={handleDropOnUngrouped}
                  >
                    {filteredUngrouped.map(renderConversationItem)}
                  </div>
                )}

                {/* Scheduled Tasks */}
                {filteredScheduledTasks.length > 0 && (
                  <div className="mt-1 border-t border-neutral-200/50 pt-1 dark:border-neutral-700/50">
                    <button
                      onClick={() => {
                        setIsSchedulesCollapsed((prev) => {
                          const next = !prev;
                          try {
                            localStorage.setItem('sidebar-schedules-collapsed', String(next));
                          } catch {
                            /* ignore */
                          }
                          return next;
                        });
                      }}
                      className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-neutral-400 transition hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
                    >
                      {isSchedulesCollapsed ? (
                        <ChevronRight className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                      <Timer className="h-3 w-3" />
                      定时任务
                    </button>
                    {!isSchedulesCollapsed && (
                      <div className="mt-0.5 space-y-0.5">
                        {filteredScheduledTasks.map((task) => (
                          <div
                            key={task.id}
                            onClick={onSchedulesClick}
                            className="group cursor-pointer rounded-lg px-2.5 py-1.5 transition-colors hover:bg-white/60 dark:hover:bg-neutral-800/50"
                          >
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                  task.enabled
                                    ? 'bg-green-400 dark:bg-green-500'
                                    : 'bg-neutral-300 dark:bg-neutral-600'
                                }`}
                              />
                              <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-700 dark:text-neutral-300">
                                {task.name}
                              </span>
                              {task.lastRunStatus && (
                                <span
                                  className={`shrink-0 text-[9px] ${
                                    task.lastRunStatus === 'success'
                                      ? 'text-green-500'
                                      : task.lastRunStatus === 'error'
                                        ? 'text-red-500'
                                        : 'text-yellow-500'
                                  }`}
                                >
                                  {task.lastRunStatus === 'success'
                                    ? 'OK'
                                    : task.lastRunStatus === 'error'
                                      ? 'ERR'
                                      : 'SKIP'}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Apps Section */}
                {filteredApps.length > 0 && (
                  <div className="mt-1 border-t border-neutral-200/50 pt-1 dark:border-neutral-700/50">
                    <button
                      onClick={() => {
                        setIsAppsCollapsed((prev) => {
                          const next = !prev;
                          try {
                            localStorage.setItem('sidebar-apps-collapsed', String(next));
                          } catch {
                            /* ignore */
                          }
                          return next;
                        });
                      }}
                      className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-neutral-400 transition hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
                    >
                      {isAppsCollapsed ? (
                        <ChevronRight className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                      <Globe className="h-3 w-3" />
                      应用
                      <span className="ml-auto text-[10px] font-normal">
                        {apps.length}
                      </span>
                    </button>
                    {!isAppsCollapsed && (
                      <div className="mt-0.5">
                        <AppPanel onOpenDbViewer={onOpenDbViewer} apps={filteredApps} onAppsChanged={refreshApps} />
                      </div>
                    )}
                  </div>
                )}

                {/* Search no results */}
                {searchQuery.trim() &&
                  filteredUngrouped.length === 0 &&
                  filteredProjects.length === 0 &&
                  filteredScheduledTasks.length === 0 &&
                  filteredApps.length === 0 && (
                    <div className="py-4 text-center text-xs text-neutral-400 dark:text-neutral-500">
                      未找到匹配的任务
                    </div>
                  )}
              </>
            )}
          </div>}
        </div>
      </div>

      {/* Context menu for projects */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[140px] rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              const project = projects.find((p) => p.id === contextMenu.projectId);
              if (project) {
                setEditingProjectId(project.id);
                setEditingProjectName(project.name);
                setTimeout(() => editProjectInputRef.current?.focus(), 0);
              }
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            <Pencil className="h-3 w-3" />
            重命名
          </button>
          <button
            onClick={() => {
              handleArchiveProject(contextMenu.projectId);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            <Archive className="h-3 w-3" />
            归档
          </button>
        </div>
      )}

      {/* File Tree - bottom section (collapsible) */}
      <div
        className={`flex flex-col border-t ${isFilesCollapsed ? '' : 'min-h-[200px]'}`}
        style={isFilesCollapsed ? { borderColor: 'var(--color-sidebar-border)' } : { flex: '0 0 40%', borderColor: 'var(--color-sidebar-border)' }}
      >
        <button
          onClick={() => {
            setIsFilesCollapsed((prev) => {
              const next = !prev;
              try {
                localStorage.setItem('sidebar-files-collapsed', String(next));
              } catch {
                /* ignore */
              }
              return next;
            });
          }}
          className="flex shrink-0 items-center gap-1 px-4 py-1.5 text-xs font-semibold text-neutral-400 transition hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
        >
          {isFilesCollapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          文件
        </button>
        {!isFilesCollapsed && (
          <FileTree
            onFileSelect={onFileSelect}
            selectedPath={selectedFilePath}
            onFileDeleted={onFileDeleted}
          />
        )}
      </div>

      {/* Bottom bar - Settings only */}
      <div className="flex shrink-0 items-center justify-end border-t px-3 py-1.5" style={{ borderColor: 'var(--color-sidebar-border)' }}>
        <button
          onClick={onSettingsClick}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-neutral-200/60 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          title="设置"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
