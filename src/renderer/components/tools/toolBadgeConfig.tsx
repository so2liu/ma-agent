import {
  BookOpen,
  Brain,
  FileEdit,
  FilePen,
  FileText,
  Globe,
  ListTodo,
  Search,
  SearchCode,
  Sparkles,
  Terminal,
  XCircle,
  Zap
} from 'lucide-react';
import type { ReactNode } from 'react';

import type { ToolUseSimple } from '@/types/chat';

export interface ToolBadgeConfig {
  icon: ReactNode;
  colors: {
    border: string;
    bg: string;
    text: string;
    hoverBg: string;
    chevron: string;
    iconColor: string;
  };
}

const TOOL_COLORS = {
  amber: {
    border: 'border-border',
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    hoverBg: 'hover:bg-accent',
    chevron: 'text-muted-foreground/70',
    iconColor: 'text-muted-foreground'
  },
  blue: {
    border: 'border-border',
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    hoverBg: 'hover:bg-accent',
    chevron: 'text-muted-foreground/70',
    iconColor: 'text-muted-foreground'
  },
  cyan: {
    border: 'border-border',
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    hoverBg: 'hover:bg-accent',
    chevron: 'text-muted-foreground/70',
    iconColor: 'text-muted-foreground'
  },
  emerald: {
    border: 'border-border',
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    hoverBg: 'hover:bg-accent',
    chevron: 'text-muted-foreground/70',
    iconColor: 'text-muted-foreground'
  },
  indigo: {
    border: 'border-border',
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    hoverBg: 'hover:bg-accent',
    chevron: 'text-muted-foreground/70',
    iconColor: 'text-muted-foreground'
  },
  rose: {
    border: 'border-border',
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    hoverBg: 'hover:bg-accent',
    chevron: 'text-muted-foreground/70',
    iconColor: 'text-muted-foreground'
  },
  teal: {
    border: 'border-border',
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    hoverBg: 'hover:bg-accent',
    chevron: 'text-muted-foreground/70',
    iconColor: 'text-muted-foreground'
  },
  violet: {
    border: 'border-border',
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    hoverBg: 'hover:bg-accent',
    chevron: 'text-muted-foreground/70',
    iconColor: 'text-muted-foreground'
  }
} satisfies Record<string, ToolBadgeConfig['colors']>;

const TOOL_ICONS: Record<string, ReactNode> = {
  Bash: <Terminal className="size-2.5" />,
  BashOutput: <Terminal className="size-2.5" />,
  Edit: <FileEdit className="size-2.5" />,
  Glob: <Search className="size-2.5" />,
  Grep: <SearchCode className="size-2.5" />,
  KillShell: <XCircle className="size-2.5" />,
  NotebookEdit: <BookOpen className="size-2.5" />,
  Read: <FileText className="size-2.5" />,
  Skill: <Sparkles className="size-2.5" />,
  Task: <Zap className="size-2.5" />,
  TodoWrite: <ListTodo className="size-2.5" />,
  WebFetch: <Globe className="size-2.5" />,
  WebSearch: <Search className="size-2.5" />,
  Write: <FilePen className="size-2.5" />
};

const TOOL_VARIANTS: Record<string, keyof typeof TOOL_COLORS> = {
  Bash: 'amber',
  BashOutput: 'amber',
  Edit: 'emerald',
  Glob: 'violet',
  Grep: 'violet',
  KillShell: 'amber',
  NotebookEdit: 'teal',
  Read: 'emerald',
  Skill: 'rose',
  Task: 'indigo',
  TodoWrite: 'indigo',
  WebFetch: 'cyan',
  WebSearch: 'violet',
  Write: 'emerald'
};

// Unified tool badge configuration - single source of truth
export function getToolBadgeConfig(toolName: string): ToolBadgeConfig {
  const variant = TOOL_VARIANTS[toolName] ?? 'blue';

  return {
    icon: TOOL_ICONS[toolName] ?? null,
    colors: TOOL_COLORS[variant]
  };
}

// Unified label generation logic - extracts compact label from tool
export function getToolLabel(tool: ToolUseSimple): string {
  if (!tool.parsedInput) {
    // Try to parse from inputJson if available
    if (tool.inputJson) {
      try {
        const parsed = JSON.parse(tool.inputJson);
        if (tool.name === 'Read' || tool.name === 'Write' || tool.name === 'Edit') {
          const toolNameMap: Record<string, string> = { Read: '读取', Write: '写入', Edit: '编辑' };
          const label = toolNameMap[tool.name] ?? tool.name;
          return parsed.file_path ? `${label} ${parsed.file_path.split('/').pop()}` : label;
        }
        if (tool.name === 'Bash') {
          return parsed.description || parsed.command ?
              parsed.description || parsed.command.split(' ')[0]
            : '执行命令';
        }
        if (tool.name === 'BashOutput') {
          return '命令输出';
        }
        if (tool.name === 'Skill') {
          return parsed.skill ? `技能(${parsed.skill})` : '技能';
        }
        if (tool.name === 'Glob') {
          return '查找';
        }
        if (tool.name === 'Grep') {
          return '搜索';
        }
        if (tool.name === 'WebSearch') {
          return '搜索';
        }
        if (tool.name === 'WebFetch') {
          return '获取';
        }
        if (tool.name === 'TodoWrite') {
          return '任务列表';
        }
        if (tool.name === 'KillShell') {
          return '停止终端';
        }
      } catch {
        // Ignore parse errors
      }
    }
    return tool.name;
  }

  switch (tool.name) {
    case 'Read':
    case 'Write':
    case 'Edit': {
      const toolNameMap: Record<string, string> = { Read: '读取', Write: '写入', Edit: '编辑' };
      const label = toolNameMap[tool.name] ?? tool.name;
      const input = tool.parsedInput as { file_path?: string };
      if (input.file_path) {
        const fileName = input.file_path.split('/').pop() || input.file_path;
        return fileName.length > 20 ?
            `${label} ${fileName.substring(0, 17)}...`
          : `${label} ${fileName}`;
      }
      return label;
    }
    case 'Bash': {
      const input = tool.parsedInput as { command?: string; description?: string };
      if (input.description) return input.description;
      if (input.command) {
        const cmd = input.command.split(' ')[0];
        return cmd.length > 15 ? `${cmd.substring(0, 12)}...` : cmd;
      }
      return '执行命令';
    }
    case 'BashOutput': {
      return '命令输出';
    }
    case 'Grep': {
      const input = tool.parsedInput as { pattern?: string };
      if (input.pattern) {
        const pattern =
          input.pattern.length > 15 ? `${input.pattern.substring(0, 12)}...` : input.pattern;
        return `搜索 "${pattern}"`;
      }
      return '搜索';
    }
    case 'Glob': {
      const input = tool.parsedInput as { pattern?: string };
      if (input.pattern) {
        const pattern =
          input.pattern.length > 15 ? `${input.pattern.substring(0, 12)}...` : input.pattern;
        return `查找 ${pattern}`;
      }
      return '查找';
    }
    case 'Task': {
      const input = tool.parsedInput as { description?: string };
      if (input.description) {
        return input.description.length > 25 ?
            `${input.description.substring(0, 22)}...`
          : input.description;
      }
      return '子任务';
    }
    case 'WebFetch': {
      const input = tool.parsedInput as { url?: string };
      if (input.url) {
        try {
          const url = new URL(input.url);
          return url.hostname.length > 20 ? `${url.hostname.substring(0, 17)}...` : url.hostname;
        } catch {
          return input.url.length > 20 ? `${input.url.substring(0, 17)}...` : input.url;
        }
      }
      return '获取';
    }
    case 'WebSearch': {
      const input = tool.parsedInput as { query?: string };
      if (input.query) {
        return input.query.length > 20 ? `${input.query.substring(0, 17)}...` : input.query;
      }
      return '搜索';
    }
    case 'TodoWrite': {
      const input = tool.parsedInput as { todos?: Array<{ status?: string }> };
      if (input.todos && input.todos.length > 0) {
        const completedCount = input.todos.filter((t) => t.status === 'completed').length;
        return `任务 ${completedCount}/${input.todos.length}`;
      }
      return '任务列表';
    }
    case 'Skill': {
      const input = tool.parsedInput as { skill?: string };
      if (input.skill) {
        return `技能(${input.skill})`;
      }
      return '技能';
    }
    default:
      return tool.name;
  }
}

// Unified expanded label generation logic - for ToolHeader in expanded state
// Returns the base semantic label (without pattern/file details) to match collapsed badge
export function getToolExpandedLabel(tool: ToolUseSimple): string {
  switch (tool.name) {
    case 'Glob':
      return '查找';
    case 'Grep':
      return '搜索';
    case 'WebSearch':
      return '搜索';
    case 'WebFetch':
      return '获取';
    case 'Bash': {
      const input = tool.parsedInput as { description?: string };
      return input?.description || '执行命令';
    }
    case 'BashOutput':
      return '命令输出';
    case 'TodoWrite':
      return '任务列表';
    case 'Task': {
      const input = tool.parsedInput as { description?: string };
      return input?.description || '子任务';
    }
    case 'Read':
      return '读取';
    case 'Write':
      return '写入';
    case 'Edit':
      return '编辑';
    case 'Skill': {
      const input = tool.parsedInput as { skill?: string };
      return input?.skill ? `技能(${input.skill})` : '技能';
    }
    case 'NotebookEdit': {
      const input = tool.parsedInput as { edit_mode?: string };
      const modeMap: Record<string, string> = {
        replace: '替换',
        insert_before: '前插入',
        insert_after: '后插入'
      };
      const modeLabel = modeMap[input?.edit_mode ?? 'replace'] ?? input?.edit_mode ?? '替换';
      return `编辑笔记本(${modeLabel})`;
    }
    case 'KillShell':
      return '停止终端';
    default:
      return tool.name;
  }
}

// Thinking badge configuration - single source of truth
export function getThinkingBadgeConfig(): ToolBadgeConfig {
  return {
    icon: <Brain className="size-2.5" />,
    colors: {
      border: 'border-border',
      bg: 'bg-muted',
      text: 'text-muted-foreground',
      hoverBg: 'hover:bg-accent',
      chevron: 'text-muted-foreground/70',
      iconColor: 'text-muted-foreground'
    }
  };
}

// Unified thinking label generation logic
export function getThinkingLabel(isComplete: boolean, durationMs?: number): string {
  const durationSeconds =
    typeof durationMs === 'number' ? Math.max(1, Math.round(durationMs / 1000)) : null;

  if (isComplete && durationSeconds) {
    return `${durationSeconds}秒`;
  }
  if (isComplete) {
    return '思考完成';
  }
  return '思考中';
}

// Get expanded thinking label (more descriptive)
export function getThinkingExpandedLabel(isComplete: boolean, durationMs?: number): string {
  const durationSeconds =
    typeof durationMs === 'number' ? Math.max(1, Math.round(durationMs / 1000)) : null;

  if (isComplete && durationSeconds) {
    const seconds = Math.round(durationMs! / 1000);
    return `思考了 ${seconds} 秒`;
  }
  if (isComplete) {
    return '思考完成';
  }
  return '思考中';
}
