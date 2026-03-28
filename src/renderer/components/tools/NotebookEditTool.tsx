import type { NotebookEditInput, ToolUseSimple } from '@/types/chat';

import { CodeBlock } from '@/components/ai-elements/code-block';
import { detectLanguage } from '@/lib/ai-elements-adapters';

import { CollapsibleTool, getToolDisplayInput } from './CollapsibleTool';

interface NotebookEditToolProps {
  tool: ToolUseSimple;
}

export default function NotebookEditTool({ tool }: NotebookEditToolProps) {
  const input = tool.parsedInput as NotebookEditInput | undefined;

  if (!input) {
    return (
      <CollapsibleTool
        tool={tool}
        title="编辑笔记本"
        input={getToolDisplayInput(tool)}
        inputLanguage="json"
      />
    );
  }

  const editMode = input.edit_mode || 'replace';
  const cellType = input.cell_type || 'code';

  return (
    <CollapsibleTool tool={tool} title="编辑笔记本">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <code className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-foreground">
          {input.notebook_path}
        </code>
        <span className="rounded-full border border-border/60 bg-muted/50 px-2 py-0.5">
          {cellType}
        </span>
        <span className="rounded-full border border-border/60 bg-muted/50 px-2 py-0.5">
          {editMode}
        </span>
        {input.cell_id && (
          <code className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-foreground">
            {input.cell_id}
          </code>
        )}
      </div>
      {editMode !== 'delete' && (
        <CodeBlock
          code={input.new_source || ''}
          language={cellType === 'markdown' ? 'markdown' : detectLanguage(input.notebook_path)}
          showLineNumbers
        />
      )}
    </CollapsibleTool>
  );
}
