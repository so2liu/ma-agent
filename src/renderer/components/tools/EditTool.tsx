import type { EditInput, ToolUseSimple } from '@/types/chat';

import { CodeBlock } from '@/components/ai-elements/code-block';
import { detectLanguage } from '@/lib/ai-elements-adapters';

import { CollapsibleTool, getToolDisplayInput } from './CollapsibleTool';

interface EditToolProps {
  tool: ToolUseSimple;
}

export default function EditTool({ tool }: EditToolProps) {
  const input = tool.parsedInput as EditInput | undefined;

  if (!input) {
    return (
      <CollapsibleTool tool={tool} title="编辑" input={getToolDisplayInput(tool)} inputLanguage="json" />
    );
  }

  const language = detectLanguage(input.file_path);

  return (
    <CollapsibleTool tool={tool} title="编辑">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <code className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-foreground">
          {input.file_path}
        </code>
        {input.replace_all && (
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-muted-foreground">
            全部替换
          </span>
        )}
      </div>
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Old</div>
        <CodeBlock code={input.old_string || ''} language={language} showLineNumbers />
      </div>
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">New</div>
        <CodeBlock code={input.new_string || ''} language={language} showLineNumbers />
      </div>
    </CollapsibleTool>
  );
}
