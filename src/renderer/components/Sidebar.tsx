import {
  Archive,
  ChevronDown,
  ChevronRight,
  Clock,
  Folder,
  FolderPlus,
  MessageSquare,
  Pencil,
  Plus,
  Settings,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Conversation, Project } from '@/electron';

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
  onOpenDbViewer?: (appId: string, appName: string) => void;
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
  onOpenDbViewer,
}: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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
  const newProjectInputRef = useRef<HTMLInputElement>(null);
  const editProjectInputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  const relativeTimeFormatter = useMemo(
    () => new Intl.RelativeTimeFormat(undefined, { numeric: 'always' }),
    []
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [convResponse, projResponse] = await Promise.all([
        window.electron.conversation.list(),
        window.electron.project.list(),
      ]);
      if (convResponse.success && convResponse.conversations) {
        setConversations(convResponse.conversations);
      }
      if (projResponse.success && projResponse.projects) {
        setProjects(projResponse.projects);
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
        let lastUserMessage: (typeof parsed)[0] | undefined;
        for (let i = parsed.length - 1; i >= 0; i--) {
          if (parsed[i].role === 'user') {
            lastUserMessage = parsed[i];
            break;
          }
        }
        if (lastUserMessage) {
          if (typeof lastUserMessage.content === 'string') {
            acc[conversation.id] = truncateText(lastUserMessage.content);
          } else if (Array.isArray(lastUserMessage.content)) {
            const textBlock = lastUserMessage.content.find(
              (block) => typeof block === 'object' && block !== null && 'text' in block
            );
            if (textBlock && typeof textBlock === 'object' && 'text' in textBlock) {
              acc[conversation.id] =
                typeof textBlock.text === 'string' ? truncateText(textBlock.text) : '';
            }
          }
        }
      } catch {
        acc[conversation.id] = '';
      }
      acc[conversation.id] = acc[conversation.id] || 'Continue this conversation...';
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

  const renderConversationItem = (conversation: Conversation) => {
    const isActive = conversation.id === currentConversationId;
    return (
      <div
        key={conversation.id}
        draggable
        onDragStart={(e) => handleDragStart(e, conversation.id)}
        onClick={() => onLoadConversation(conversation.id)}
        className={`group mb-0.5 cursor-pointer rounded-lg px-2 py-1.5 transition-colors ${
          isActive
            ? 'bg-white shadow-sm dark:bg-neutral-800'
            : 'hover:bg-white/60 dark:hover:bg-neutral-800/50'
        }`}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-neutral-800 dark:text-neutral-200">
              {conversation.title}
            </div>
            <p className="mt-0.5 line-clamp-1 text-[10px] text-neutral-500 dark:text-neutral-400">
              {conversationPreviews[conversation.id]}
            </p>
            <div className="mt-0.5 flex items-center gap-1 text-[10px] text-neutral-400 dark:text-neutral-500">
              <Clock className="h-2.5 w-2.5" />
              <span>{formatRelativeDate(conversation.updatedAt)}</span>
            </div>
          </div>
          <button
            onClick={(e) => handleDelete(e, conversation.id)}
            className="shrink-0 rounded p-0.5 text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500 dark:text-neutral-600 dark:hover:text-red-400"
            aria-label="Delete conversation"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col border-r border-neutral-200/70 bg-neutral-50/80 dark:border-neutral-800 dark:bg-neutral-900/50">
      {/* Drag region for macOS traffic lights */}
      <div className="h-7 shrink-0 [-webkit-app-region:drag]" />

      {/* Brand */}
      <div className="shrink-0 px-3 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xl" role="img" aria-label="horse">
            🐴
          </span>
          <span className="text-base font-bold text-neutral-800 select-none dark:text-neutral-100">
            小马快跑
          </span>
        </div>
      </div>

      {/* Task List */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-3 pb-1.5">
          <span className="text-[10px] font-semibold tracking-wider text-neutral-400 uppercase dark:text-neutral-500">
            Tasks
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => {
                setCreatingProject(true);
                setTimeout(() => newProjectInputRef.current?.focus(), 0);
              }}
              className="rounded p-0.5 text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
              title="New project"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onNewChat()}
              className="rounded p-0.5 text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
              title="New task"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-1.5 pb-1">
          {isLoading ? (
            <div className="px-2 py-4 text-center text-xs text-neutral-400">Loading...</div>
          ) : conversations.length === 0 && projects.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-2 py-6 text-center">
              <MessageSquare className="h-4 w-4 text-neutral-300 dark:text-neutral-600" />
              <p className="text-xs text-neutral-400 dark:text-neutral-500">No tasks yet</p>
            </div>
          ) : (
            <>
              {/* New project inline input */}
              {creatingProject && (
                <div className="mb-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5">
                  <Folder className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
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
                    placeholder="Project name..."
                    className="min-w-0 flex-1 bg-transparent text-xs text-neutral-800 placeholder-neutral-400 outline-none dark:text-neutral-200 dark:placeholder-neutral-500"
                  />
                </div>
              )}

              {/* Projects */}
              {projects.map((project) => {
                const projectConversations = grouped[project.id] ?? [];
                const isCollapsed = collapsedProjects.has(project.id);
                const isDragOver = dragOverProjectId === project.id;
                const isEditing = editingProjectId === project.id;

                return (
                  <div key={project.id} className="mb-0.5">
                    {/* Project header */}
                    <div
                      className={`flex items-center gap-1 rounded-lg px-2 py-1 transition-colors ${
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
                      <Folder className="h-3.5 w-3.5 shrink-0 text-neutral-400 dark:text-neutral-500" />
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
                          className="min-w-0 flex-1 bg-transparent text-xs font-medium text-neutral-800 outline-none dark:text-neutral-200"
                        />
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-700 dark:text-neutral-300">
                          {project.name}
                        </span>
                      )}
                      <span className="shrink-0 text-[10px] text-neutral-400 dark:text-neutral-500">
                        {projectConversations.length}
                      </span>
                    </div>

                    {/* Project conversations */}
                    {!isCollapsed && (
                      <div className="ml-3 border-l border-neutral-200/50 pl-1 dark:border-neutral-700/50">
                        {projectConversations.map(renderConversationItem)}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Ungrouped conversations */}
              {ungrouped.length > 0 && projects.length > 0 && (
                <div
                  className={`mt-1 border-t border-neutral-200/50 pt-1 dark:border-neutral-700/50 ${
                    dragOverUngrouped ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDragOverUngrouped(true);
                  }}
                  onDragLeave={() => setDragOverUngrouped(false)}
                  onDrop={handleDropOnUngrouped}
                >
                  {ungrouped.map(renderConversationItem)}
                </div>
              )}

              {/* When no projects, just show all conversations flat */}
              {projects.length === 0 && ungrouped.map(renderConversationItem)}
            </>
          )}
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
            Rename
          </button>
          <button
            onClick={() => {
              handleArchiveProject(contextMenu.projectId);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            <Archive className="h-3 w-3" />
            Archive
          </button>
        </div>
      )}

      {/* Apps Panel */}
      <div className="border-t border-neutral-200/70 dark:border-neutral-800">
        <AppPanel onOpenDbViewer={onOpenDbViewer} />
      </div>

      {/* File Tree - bottom section (collapsible) */}
      <div
        className={`flex flex-col border-t border-neutral-200/70 dark:border-neutral-800 ${isFilesCollapsed ? '' : 'min-h-[200px]'}`}
        style={isFilesCollapsed ? undefined : { flex: '0 0 40%' }}
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
          className="flex shrink-0 items-center gap-1 px-3 py-1.5 text-[10px] font-semibold tracking-wider text-neutral-400 uppercase transition hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
        >
          {isFilesCollapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          Files
        </button>
        {!isFilesCollapsed && (
          <FileTree
            onFileSelect={onFileSelect}
            selectedPath={selectedFilePath}
            onFileDeleted={onFileDeleted}
          />
        )}
      </div>

      {/* Bottom bar - Skills & Settings */}
      <div className="flex shrink-0 items-center justify-between border-t border-neutral-200/70 px-2 py-1.5 dark:border-neutral-800">
        <button
          onClick={onSkillsClick}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-neutral-500 transition hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          title="Skill 精选"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Skill 精选</span>
        </button>
        <button
          onClick={onSettingsClick}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          title="设置"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
