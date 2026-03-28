import type { BashInput, ToolUseSimple } from '@/types/chat';

import { Terminal } from '@/components/ai-elements/terminal';

import { CollapsibleTool, getToolDisplayInput } from './CollapsibleTool';

interface BashToolProps {
  tool: ToolUseSimple;
}

export default function BashTool({ tool }: BashToolProps) {
  const input = tool.parsedInput as BashInput | undefined;

  if (!input) {
    return (
      <CollapsibleTool
        tool={tool}
        title={tool.name}
        input={getToolDisplayInput(tool)}
        inputLanguage="json"
      />
    );
  }

  return (
    <CollapsibleTool tool={tool} title={input.description || '执行命令'}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {input.run_in_background && (
          <span className="rounded-full border border-blue-200/60 bg-blue-50 px-2 py-0.5 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
            后台
          </span>
        )}
      </div>
      <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
        <code className="block font-mono text-sm break-words whitespace-pre-wrap text-foreground">
          $ {input.command}
        </code>
      </div>
      {tool.result !== undefined && (
        <Terminal
          className="border-border/60"
          isStreaming={Boolean(tool.isLoading) && !tool.isError}
          output={tool.result}
        />
      )}
    </CollapsibleTool>
  );
}
