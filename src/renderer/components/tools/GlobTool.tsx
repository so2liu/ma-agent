import type { ReactNode } from 'react';

import type { GlobInput, ToolUseSimple } from '@/types/chat';

import {
  FileTree,
  FileTreeFile,
  FileTreeFolder
} from '@/components/ai-elements/file-tree';
import { parseGlobToTree, type FileTreeNode } from '@/lib/ai-elements-adapters';

import { CollapsibleTool, getToolDisplayInput } from './CollapsibleTool';

interface GlobToolProps {
  tool: ToolUseSimple;
}

function collectFolderPaths(nodes: FileTreeNode[]): Set<string> {
  const expanded = new Set<string>();

  for (const node of nodes) {
    if (node.children?.length) {
      expanded.add(node.path);
      for (const childPath of collectFolderPaths(node.children)) {
        expanded.add(childPath);
      }
    }
  }

  return expanded;
}

function renderTree(nodes: FileTreeNode[]): ReactNode {
  return nodes.map((node) => {
    if (node.children?.length) {
      return (
        <FileTreeFolder key={node.path} name={node.name} path={node.path}>
          {renderTree(node.children)}
        </FileTreeFolder>
      );
    }

    return <FileTreeFile key={node.path} name={node.name} path={node.path} />;
  });
}

export default function GlobTool({ tool }: GlobToolProps) {
  const input = tool.parsedInput as GlobInput | undefined;

  if (!input) {
    return (
      <CollapsibleTool tool={tool} title="查找" input={getToolDisplayInput(tool)} inputLanguage="json" />
    );
  }

  const tree = tool.result ? parseGlobToTree(tool.result) : [];

  return (
    <CollapsibleTool tool={tool} title="查找">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <code className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-foreground">
          {input.pattern}
        </code>
        {input.path && (
          <code className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-foreground">
            {input.path}
          </code>
        )}
      </div>
      {tree.length > 0 && (
        <FileTree className="border-border/60" defaultExpanded={collectFolderPaths(tree)}>
          {renderTree(tree)}
        </FileTree>
      )}
    </CollapsibleTool>
  );
}
