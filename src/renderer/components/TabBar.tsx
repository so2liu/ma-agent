import { Pencil, X } from 'lucide-react';

export interface WorkspaceTab {
  id: string;
  type: 'artifact' | 'excalidraw';
  title: string;
  filePath: string;
  isDirty?: boolean;
}

interface TabBarProps {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
}

export default function TabBar({ tabs, activeTabId, onSelectTab, onCloseTab }: TabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div
      className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b px-1"
      style={{ borderColor: 'var(--color-sidebar-border)' }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className={`group flex max-w-[180px] cursor-pointer items-center gap-1.5 rounded-t-md px-2.5 py-1.5 text-xs transition ${
              isActive
                ? 'bg-white text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200'
                : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-300'
            }`}
            onClick={() => onSelectTab(tab.id)}
          >
            {tab.type === 'excalidraw' && (
              <Pencil className="h-3 w-3 shrink-0 text-violet-500" />
            )}
            <span className="truncate">
              {tab.isDirty ? `${tab.title} \u2022` : tab.title}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              className="shrink-0 rounded p-0.5 opacity-0 transition hover:bg-neutral-200 group-hover:opacity-100 dark:hover:bg-neutral-700"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
