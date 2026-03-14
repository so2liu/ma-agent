import { useCallback } from 'react';

import type { Artifact } from '@/components/ArtifactPanel';
import ArtifactPanel from '@/components/ArtifactPanel';
import ExcalidrawCanvas from '@/components/ExcalidrawCanvas';
import TabBar, { type WorkspaceTab } from '@/components/TabBar';

import type { SimpleElement } from '../../shared/types/canvas';

interface WorkspacePanelProps {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onTabDirtyChange: (id: string, isDirty: boolean) => void;
  /** Map of tab id → Artifact for artifact-type tabs */
  artifactMap: Map<string, Artifact>;
  /** Called when canvas elements change (for bidirectional sync) */
  onCanvasElementsChange?: (filePath: string, elements: SimpleElement[]) => void;
}

export default function WorkspacePanel({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onTabDirtyChange,
  artifactMap,
  onCanvasElementsChange
}: WorkspacePanelProps) {
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const handleDirtyChange = useCallback(
    (isDirty: boolean) => {
      if (activeTabId) onTabDirtyChange(activeTabId, isDirty);
    },
    [activeTabId, onTabDirtyChange]
  );

  const handleElementsChange = useCallback(
    (elements: SimpleElement[]) => {
      if (activeTab?.type === 'excalidraw') {
        onCanvasElementsChange?.(activeTab.filePath, elements);
      }
    },
    [activeTab, onCanvasElementsChange]
  );

  return (
    <div
      className="flex h-full flex-col border-l"
      style={{ borderColor: 'var(--color-sidebar-border)', background: 'var(--color-content-bg)' }}
    >
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
      />

      <div className="flex-1 overflow-hidden">
        {activeTab?.type === 'artifact' && (
          <ArtifactPanel
            artifact={artifactMap.get(activeTab.id) ?? null}
            onClose={() => onCloseTab(activeTab.id)}
          />
        )}

        {activeTab?.type === 'excalidraw' && (
          <ExcalidrawCanvas
            filePath={activeTab.filePath}
            onDirtyChange={handleDirtyChange}
            onElementsChange={handleElementsChange}
          />
        )}

        {!activeTab && tabs.length > 0 && (
          <div className="flex h-full items-center justify-center text-xs text-neutral-400">
            Select a tab
          </div>
        )}
      </div>
    </div>
  );
}
