import { BarChart3, FileText, Globe, Palette, PenLine, Sparkles } from 'lucide-react';
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
  const handleClick = (card: SkillCard) => {
    if (card.id === 'more') {
      onMoreClick?.();
      return;
    }
    if (card.prefillPrompt) {
      onSelectSkill(card.prefillPrompt);
    }
  };

  return (
    <div className="grid w-full max-w-2xl grid-cols-3 gap-2.5 px-4">
      {skillCards.map((card) => {
        const Icon = iconMap[card.icon];
        return (
          <button
            key={card.id}
            onClick={() => handleClick(card)}
            className="group flex items-start gap-3 rounded-xl border border-neutral-200/60 bg-white/80 px-3.5 py-3 text-left transition hover:border-neutral-300/80 hover:bg-white hover:shadow-sm dark:border-neutral-800/60 dark:bg-neutral-800/40 dark:hover:border-neutral-700/80 dark:hover:bg-neutral-800/70"
          >
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{
                background: `linear-gradient(135deg, ${card.gradient.from}, ${card.gradient.to})`,
              }}
            >
              <Icon className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-100">
                {card.title}
              </div>
              <div className="mt-0.5 text-[10px] leading-tight text-neutral-500 dark:text-neutral-400">
                {card.description}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
