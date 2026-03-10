import { ArrowRight, BarChart3, FileText, Globe, Palette, PenLine, Sparkles } from 'lucide-react';
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
  Sparkles
};

interface SkillCardGridProps {
  onSelectSkill: (prefillPrompt: string) => void;
  onMoreClick?: () => void;
  currentInput?: string;
}

export default function SkillCardGrid({
  onSelectSkill,
  onMoreClick,
  currentInput = ''
}: SkillCardGridProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmedInput, setConfirmedInput] = useState<string | null>(null);

  const selectedCard = skillCards.find((c) => c.id === selectedId);
  const isConfirmed = confirmedInput !== null && confirmedInput === currentInput;

  const handlePillClick = useCallback(
    (card: SkillCard) => {
      if (card.id === 'more') {
        setSelectedId(null);
        onMoreClick?.();
        return;
      }
      setSelectedId((prev) => (prev === card.id ? null : card.id));
      setConfirmedInput(null);
    },
    [onMoreClick]
  );

  const handleUsePrompt = useCallback(() => {
    if (!selectedCard?.prefillPrompt) return;

    if (currentInput.trim() && !isConfirmed) {
      setConfirmedInput(currentInput);
      return;
    }

    onSelectSkill(selectedCard.prefillPrompt);
    setSelectedId(null);
    setConfirmedInput(null);
  }, [selectedCard, currentInput, isConfirmed, onSelectSkill]);

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-3 px-4">
      {/* Pill tags */}
      <div className="flex flex-wrap justify-center gap-2">
        {skillCards.map((card) => {
          const Icon = iconMap[card.icon];
          const isSelected = card.id === selectedId;
          return (
            <button
              key={card.id}
              onClick={() => handlePillClick(card)}
              aria-label={`${card.title}: ${card.description}`}
              aria-expanded={isSelected && !!card.detail}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-neutral-400/50 active:scale-[0.97] ${
                isSelected ?
                  'border-neutral-400 bg-neutral-100 text-neutral-800 dark:border-neutral-500 dark:bg-neutral-700 dark:text-neutral-100'
                : 'dark:hover:bg-neutral-750 border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-600'
              }`}
            >
              <Icon className="h-3.5 w-3.5" style={{ color: card.iconColor }} />
              {card.title}
            </button>
          );
        })}
      </div>

      {/* Detail card */}
      {selectedCard?.detail && (
        <div className="animate-in fade-in slide-in-from-top-2 w-full max-w-lg duration-200">
          <div className="rounded-xl border border-neutral-200/80 bg-white/90 p-4 shadow-sm backdrop-blur dark:border-neutral-700/80 dark:bg-neutral-800/90">
            <div className="mb-3 flex items-center gap-2">
              <div
                className="flex h-6 w-6 items-center justify-center rounded-md"
                style={{ backgroundColor: selectedCard.iconColor }}
              >
                {(() => {
                  const Icon = iconMap[selectedCard.icon];
                  return <Icon className="h-3.5 w-3.5 text-white" />;
                })()}
              </div>
              <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                {selectedCard.title}
              </span>
              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                {selectedCard.description}
              </span>
            </div>

            <div className="mb-3 space-y-2">
              <div>
                <div className="mb-0.5 text-[10px] font-medium tracking-wider text-neutral-400 uppercase dark:text-neutral-500">
                  场景
                </div>
                <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                  {selectedCard.detail.background}
                </p>
              </div>
              <div>
                <div className="mb-0.5 text-[10px] font-medium tracking-wider text-neutral-400 uppercase dark:text-neutral-500">
                  安排任务
                </div>
                <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                  {selectedCard.detail.task}
                </p>
              </div>
              <div>
                <div className="mb-0.5 text-[10px] font-medium tracking-wider text-neutral-400 uppercase dark:text-neutral-500">
                  完成效果
                </div>
                <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                  {selectedCard.detail.output}
                </p>
              </div>
            </div>

            <button
              onClick={handleUsePrompt}
              className="flex items-center gap-1 rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-700 dark:bg-neutral-200 dark:text-neutral-800 dark:hover:bg-neutral-300"
            >
              {isConfirmed ? '确认替换当前输入' : '使用此场景'}
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
