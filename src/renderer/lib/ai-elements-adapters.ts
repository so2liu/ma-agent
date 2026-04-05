import type { FileUIPart } from 'ai';
import { createElement, type MouseEvent } from 'react';
import type { BundledLanguage } from 'shiki';
import type { Components } from 'streamdown';

import type { MessageAttachment, ContentBlock, ToolUseSimple } from '../types/chat';
import {
  DEFAULT_MODEL_IDS,
  DEFAULT_MODEL_NAMES,
  DEFAULT_OPENAI_MODEL_IDS,
  DEFAULT_OPENAI_MODEL_NAMES,
  type ChatModelPreference,
  type CustomModelIds,
  type LlmProvider
} from '../../shared/types/ipc';

export type AIElementsToolState =
  | 'input-streaming'
  | 'input-available'
  | 'output-available'
  | 'output-error';

export type ReasoningMapping = {
  content: string;
  duration?: number;
  isStreaming: boolean;
};

export type AttachmentMapping = FileUIPart & {
  id: string;
  _meta: {
    relativePath?: string;
    savedPath?: string;
    size: number;
  };
};

export type FileTreeNode = {
  children?: FileTreeNode[];
  name: string;
  path: string;
};

export type ModelPreferenceMapping = {
  id: string;
  name: string;
  provider: LlmProvider;
};

const EXTENSION_LANGUAGE_MAP: Record<string, BundledLanguage> = {
  bash: 'bash',
  c: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  cts: 'typescript',
  cxx: 'cpp',
  diff: 'diff',
  dockerfile: 'docker',
  env: 'bash',
  go: 'go',
  h: 'c',
  hpp: 'cpp',
  htm: 'html',
  html: 'html',
  ini: 'ini',
  java: 'java',
  js: 'javascript',
  json: 'json',
  jsx: 'jsx',
  kt: 'kotlin',
  log: 'bash',
  m: 'objective-c',
  md: 'markdown',
  mdx: 'mdx',
  mjs: 'javascript',
  mts: 'typescript',
  php: 'php',
  pl: 'perl',
  ps1: 'powershell',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'shellscript',
  sql: 'sql',
  svg: 'xml',
  swift: 'swift',
  toml: 'toml',
  ts: 'typescript',
  tsx: 'tsx',
  txt: 'markdown',
  vue: 'vue',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'shellscript'
};

const BASENAME_LANGUAGE_MAP: Record<string, BundledLanguage> = {
  '.bash_profile': 'shellscript',
  '.bashrc': 'shellscript',
  '.env': 'bash',
  '.gitignore': 'git-commit',
  '.npmrc': 'ini',
  '.zprofile': 'shellscript',
  '.zshenv': 'shellscript',
  '.zshrc': 'shellscript',
  'brewfile': 'ruby',
  'dockerfile': 'docker',
  'gemfile': 'ruby',
  'makefile': 'make',
  'package-lock.json': 'json',
  'package.json': 'json',
  'pnpm-lock.yaml': 'yaml',
  'tsconfig.json': 'json',
  'yarn.lock': 'yaml'
};

function toFileUrl(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const encodedPath = encodeURI(normalizedPath);
  return encodedPath.startsWith('/') ? `file://${encodedPath}` : `file:///${encodedPath}`;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+/g, '/').trim();
}

function inferProviderFromModelId(modelId: string): LlmProvider {
  return /^claude/i.test(modelId) ? 'anthropic' : 'openai';
}

function getDefaultModelMetadata(pref: ChatModelPreference): ModelPreferenceMapping {
  return {
    id: DEFAULT_MODEL_IDS[pref],
    name: DEFAULT_MODEL_NAMES[pref],
    provider: 'anthropic'
  };
}

function getOpenAIModelName(modelId: string): string | undefined {
  const matchedPreference = (Object.entries(DEFAULT_OPENAI_MODEL_IDS) as Array<
    [ChatModelPreference, string]
  >).find(([, value]) => value === modelId)?.[0];

  return matchedPreference ? DEFAULT_OPENAI_MODEL_NAMES[matchedPreference] : undefined;
}

type MutableTreeNode = FileTreeNode & {
  childrenMap?: Map<string, MutableTreeNode>;
};

function finalizeTree(nodes: MutableTreeNode[]): FileTreeNode[] {
  return nodes
    .sort((left, right) => {
      const leftIsFolder = Boolean(left.childrenMap?.size);
      const rightIsFolder = Boolean(right.childrenMap?.size);
      if (leftIsFolder !== rightIsFolder) {
        return leftIsFolder ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    })
    .map(({ childrenMap, ...node }) => ({
      ...node,
      ...(childrenMap?.size ? { children: finalizeTree([...childrenMap.values()]) } : {})
    }));
}

function hasCompleteToolInput(tool: ToolUseSimple): boolean {
  if (tool.inputJson === undefined) {
    return tool.parsedInput !== undefined;
  }

  try {
    JSON.parse(tool.inputJson);
    return true;
  } catch {
    return false;
  }
}

export function mapToolState(tool: ToolUseSimple): AIElementsToolState {
  if (tool.isError) {
    return 'output-error';
  }

  if (tool.result !== undefined) {
    return 'output-available';
  }

  if (hasCompleteToolInput(tool)) {
    return 'input-available';
  }

  if (tool.inputJson !== undefined) {
    return 'input-streaming';
  }

  return 'input-streaming';
}

export function mapThinkingToReasoning(block: ContentBlock): ReasoningMapping {
  return {
    content: block.thinking ?? '',
    duration:
      block.thinkingDurationMs !== undefined ? Math.max(1, Math.ceil(block.thinkingDurationMs / 1000)) : undefined,
    isStreaming: block.type === 'thinking' && !block.isComplete
  };
}

export function mapAttachment(att: MessageAttachment): AttachmentMapping {
  const mediaType =
    att.mimeType || (att.isImage || att.mimeType?.startsWith('image/') ? 'image/*' : 'application/octet-stream');
  const url = att.previewUrl ?? (att.savedPath ? toFileUrl(att.savedPath) : '');

  return {
    id: att.id,
    type: 'file',
    filename: att.name,
    mediaType,
    url,
    _meta: {
      relativePath: att.relativePath,
      savedPath: att.savedPath,
      size: att.size
    }
  };
}

export function mapModelPreference(
  pref: ChatModelPreference,
  customModelIds?: CustomModelIds
): ModelPreferenceMapping {
  const customModelId = customModelIds?.[pref]?.trim();
  if (!customModelId) {
    return getDefaultModelMetadata(pref);
  }

  const provider = inferProviderFromModelId(customModelId);
  const defaultAnthropicName =
    (Object.entries(DEFAULT_MODEL_IDS) as Array<[ChatModelPreference, string]>).find(
      ([, value]) => value === customModelId
    )?.[0] ?? null;

  return {
    id: customModelId,
    name:
      (defaultAnthropicName ? DEFAULT_MODEL_NAMES[defaultAnthropicName] : undefined) ??
      getOpenAIModelName(customModelId) ??
      customModelId,
    provider
  };
}

export function parseGlobToTree(result: string): FileTreeNode[] {
  const root = new Map<string, MutableTreeNode>();

  for (const rawLine of result.split('\n')) {
    const normalized = normalizePath(rawLine);
    if (!normalized || normalized === '.') {
      continue;
    }

    const isAbsolute = normalized.startsWith('/');
    const segments = normalized.split('/').filter(Boolean);
    if (segments.length === 0) {
      continue;
    }

    let currentLevel = root;

    for (const [index, segment] of segments.entries()) {
      const currentPath =
        isAbsolute ? `/${segments.slice(0, index + 1).join('/')}` : segments.slice(0, index + 1).join('/');
      let node = currentLevel.get(segment);

      if (!node) {
        node = { name: segment, path: currentPath };
        currentLevel.set(segment, node);
      }

      if (index < segments.length - 1) {
        node.childrenMap ??= new Map<string, MutableTreeNode>();
        currentLevel = node.childrenMap;
      }
    }
  }

  return finalizeTree([...root.values()]);
}

export function detectLanguage(filePath: string | undefined): BundledLanguage {
  if (!filePath) return 'markdown';
  const normalizedPath = normalizePath(filePath);
  const basename = normalizedPath.split('/').pop()?.toLowerCase() ?? '';
  const extension = basename.includes('.') ? basename.split('.').pop() ?? '' : basename;

  return (
    BASENAME_LANGUAGE_MAP[basename] ??
    EXTENSION_LANGUAGE_MAP[extension] ??
    'markdown'
  );
}

export const ExternalLink: Components['a'] = ({ href, onClick, children, ...props }) => {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) {
      return;
    }

    event.preventDefault();
    if (!href) {
      return;
    }

    window.electron.shell.openExternal(href).catch((error) => {
      console.error('Failed to open external link:', error);
    });
  };

  return createElement('a', { ...props, href, onClick: handleClick }, children);
};

export const messageResponseComponents: Components = {
  a: ExternalLink
};
