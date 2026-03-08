import {
  ArrowRight,
  BarChart3,
  FileText,
  Globe,
  Palette,
  PenLine,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
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
}

export default function SkillCardGrid({ onSelectSkill, onMoreClick }: SkillCardGridProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedCard = skillCards.find((c) => c.id === selectedId);

  const handlePillClick = (card: SkillCard) => {
    if (card.id === 'more') {
      setSelectedId(null);
      onMoreClick?.();
      return;
    }
    setSelectedId((prev) => (prev === card.id ? null : card.id));
  };

  const handleUsePrompt = () => {
    if (selectedCard?.prefillPrompt) {
      onSelectSkill(selectedCard.prefillPrompt);
    }
  };

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
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                isSelected
                  ? 'border-neutral-400 bg-neutral-100 text-neutral-800 dark:border-neutral-500 dark:bg-neutral-700 dark:text-neutral-100'
                  : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:bg-neutral-750'
              }`}
            >
              <Icon
                className="h-3.5 w-3.5"
                style={{ color: card.gradient.from }}
              />
              {card.title}
            </button>
          );
        })}
      </div>

      {/* Detail card */}
      {selectedCard?.detail && (
        <div className="w-full max-w-lg animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="rounded-xl border border-neutral-200/80 bg-white/90 p-4 shadow-sm backdrop-blur dark:border-neutral-700/80 dark:bg-neutral-800/90">
            <div className="mb-3 flex items-center gap-2">
              <div
                className="flex h-6 w-6 items-center justify-center rounded-md"
                style={{
                  background: `linear-gradient(135deg, ${selectedCard.gradient.from}, ${selectedCard.gradient.to})`,
                }}
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
                <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  示例提示词
                </div>
                <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                  {selectedCard.prefillPrompt}
                </p>
              </div>
              <div>
                <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  最终产物
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
              使用此提示词
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
