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
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const hoveredCard = skillCards.find((c) => c.id === hoveredId);
  const selectedCard = skillCards.find((c) => c.id === selectedId);

  const handleClick = useCallback(
    (card: SkillCard) => {
      if (card.id === 'more') {
        onMoreClick?.();
        return;
      }
      if (!card.prefillPrompt) return;

      if (currentInput.trim()) {
        setSelectedId(card.id);
      } else {
        onSelectSkill(card.prefillPrompt);
      }
    },
    [onMoreClick, onSelectSkill, currentInput],
  );

  const handleConfirmReplace = useCallback(() => {
    if (selectedCard?.prefillPrompt) {
      onSelectSkill(selectedCard.prefillPrompt);
    }
    setSelectedId(null);
  }, [selectedCard, onSelectSkill]);

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-2 px-4">
      <div className="flex flex-wrap justify-center gap-2">
        {skillCards.map((card) => {
          const Icon = iconMap[card.icon];
          const isSelected = selectedId === card.id;
          return (
            <button
              key={card.id}
              onClick={() => handleClick(card)}
              onMouseEnter={() => setHoveredId(card.id)}
              onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setHoveredId(card.id)}
              onBlur={() => setHoveredId(null)}
              aria-label={`${card.title}: ${card.example}`}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-neutral-400/50 active:scale-[0.97] ${
                isSelected
                  ? 'border-neutral-400 bg-neutral-800 text-white dark:border-neutral-400 dark:bg-neutral-200 dark:text-neutral-900'
                  : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-neutral-100'
              }`}
            >
              <Icon
                className="h-3.5 w-3.5"
                style={{ color: isSelected ? undefined : card.iconColor }}
              />
              {card.title}
            </button>
          );
        })}
      </div>

      {/* Hint / confirmation */}
      <div className="h-5">
        {hoveredCard?.example && !selectedId && (
          <p className="animate-in fade-in duration-150 text-xs text-neutral-400 dark:text-neutral-500">
            例: {hoveredCard.example}
          </p>
        )}
        {selectedCard?.prefillPrompt && (
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
