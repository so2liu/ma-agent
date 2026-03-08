interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Switch({ checked, onCheckedChange, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-neutral-300 dark:focus-visible:ring-offset-neutral-950 ${
        checked
          ? 'bg-neutral-900 dark:bg-neutral-50'
          : 'bg-neutral-200 dark:bg-neutral-700'
      }`}
    >
      <span
        className={`pointer-events-none block h-4 w-4 rounded-full shadow-lg ring-0 transition-transform duration-200 ${
          checked
            ? 'translate-x-4 bg-white dark:bg-neutral-900'
            : 'translate-x-0 bg-white dark:bg-neutral-400'
        }`}
      />
    </button>
  );
}
