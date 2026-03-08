import {
  BarChart3,
  FileText,
  Globe,
  Palette,
  PenLine,
  Sparkles,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import type { ComponentType, SVGProps } from 'react';

import type { SkillCard } from '@/constants/skillCards';
import { skillCards } from '@/constants/skillCards';

const iconMap: Record<SkillCard['icon'], ComponentType<SVGProps<SVGSVGElement>>> = {
  FileText,
  BarChart3,
  PenLine,
  Globe,
  Palette,
  Sparkles,
};

interface SkillCardGridProps {
  onSelectSkill: (prefillPrompt: string) => void;
  onMoreClick?: () => void;
  currentInput?: string;
}

export default function SkillCardGrid({ onSelectSkill, onMoreClick, currentInput = '' }: SkillCardGridProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeCard = skillCards.find((c) => c.id === activeId);

  const handleClick = useCallback(
    (card: SkillCard) => {
      if (card.id === 'more') {
        onMoreClick?.();
        return;
      }
      if (!card.prefillPrompt) return;

      if (currentInput.trim()) {
        setActiveId(card.id);
      } else {
        onSelectSkill(card.prefillPrompt);
      }
    },
    [onMoreClick, onSelectSkill, currentInput],
  );

  const handleConfirmReplace = useCallback(() => {
    if (activeCard?.prefillPrompt) {
      onSelectSkill(activeCard.prefillPrompt);
    }
    setActiveId(null);
  }, [activeCard, onSelectSkill]);

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-2 px-4">
      <div className="flex flex-wrap justify-center gap-2">
        {skillCards.map((card) => {
          const Icon = iconMap[card.icon];
          return (
            <button
              key={card.id}
              onClick={() => handleClick(card)}
              onMouseEnter={() => !activeId && setActiveId(card.id)}
              onMouseLeave={() => !currentInput.trim() && setActiveId(null)}
              onFocus={() => !activeId && setActiveId(card.id)}
              onBlur={() => !currentInput.trim() && setActiveId(null)}
              aria-label={`${card.title}: ${card.example}`}
              className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 transition-all hover:border-neutral-300 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-neutral-400/50 active:scale-[0.97] dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:bg-neutral-750"
            >
              <Icon
                className="h-3.5 w-3.5"
                style={{ color: card.iconColor }}
              />
              {card.title}
            </button>
          );
        })}
      </div>

      {/* Hint / confirmation */}
      <div className="h-5">
        {activeCard?.example && !currentInput.trim() && (
          <p className="animate-in fade-in duration-150 text-xs text-neutral-400 dark:text-neutral-500">
            例: {activeCard.example}
          </p>
        )}
        {activeCard?.prefillPrompt && currentInput.trim() && (
          <p className="animate-in fade-in duration-150 text-xs text-neutral-400 dark:text-neutral-500">
            将替换当前输入 —{' '}
            <button
              onClick={handleConfirmReplace}
              className="text-neutral-600 underline hover:text-neutral-800 dark:text-neutral-300 dark:hover:text-neutral-100"
            >
              确认替换
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
