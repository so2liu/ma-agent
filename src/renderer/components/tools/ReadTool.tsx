import type { ReadInput, ToolUseSimple } from '@/types/chat';

import { CodeBlock } from '@/components/ai-elements/code-block';
import { detectLanguage } from '@/lib/ai-elements-adapters';

import { CollapsibleTool, getToolDisplayInput } from './CollapsibleTool';

interface ReadToolProps {
  tool: ToolUseSimple;
}

export default function ReadTool({ tool }: ReadToolProps) {
  const input = tool.parsedInput as ReadInput | undefined;

  if (!input) {
    return (
      <CollapsibleTool tool={tool} title="读取" input={getToolDisplayInput(tool)} inputLanguage="json" />
    );
  }

  return (
    <CollapsibleTool tool={tool} title="读取">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <code className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-foreground">
          {input.file_path}
        </code>
        {input.offset !== undefined && (
          <span className="rounded-full border border-border/60 bg-muted/50 px-2 py-0.5">
            第 {input.offset} 行起
          </span>
        )}
        {input.limit !== undefined && (
          <span className="rounded-full border border-border/60 bg-muted/50 px-2 py-0.5">
            读 {input.limit} 行
          </span>
        )}
      </div>
      {tool.result !== undefined && (
        <CodeBlock
          code={tool.result}
          language={detectLanguage(input.file_path)}
          showLineNumbers
        />
      )}
    </CollapsibleTool>
  );
}
