import { useEffect, useRef } from 'react';

import type { SlashCommandItem } from '@/hooks/useSlashCommand';

interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  selectedIndex: number;
  onSelect: (item: SlashCommandItem) => void;
  onHover: (index: number) => void;
}

export default function SlashCommandMenu({
  items,
  selectedIndex,
  onSelect,
  onHover
}: SlashCommandMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200/80 bg-white/95 p-3 shadow-lg backdrop-blur-xl dark:border-neutral-700/70 dark:bg-neutral-900/95">
        <p className="text-xs text-neutral-400 dark:text-neutral-500">没有匹配的技能</p>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="max-h-60 overflow-y-auto rounded-xl border border-neutral-200/80 bg-white/95 shadow-lg backdrop-blur-xl dark:border-neutral-700/70 dark:bg-neutral-900/95"
    >
      {items.map((item, index) => (
        <button
          key={item.id}
          ref={index === selectedIndex ? selectedRef : undefined}
          onMouseDown={(e) => {
            e.preventDefault(); // Prevent textarea blur
            onSelect(item);
          }}
          onMouseEnter={() => onHover(index)}
          className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors ${
            index === selectedIndex ?
              'bg-neutral-100 dark:bg-neutral-800'
            : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
          }`}
        >
          <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
            /{item.name}
            {item.displayName !== item.name && (
              <span className="ml-1.5 text-xs font-normal text-neutral-500 dark:text-neutral-400">
                {item.displayName}
              </span>
            )}
          </span>
          {item.description && (
            <span className="line-clamp-1 text-xs text-neutral-400 dark:text-neutral-500">
              {item.description}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
