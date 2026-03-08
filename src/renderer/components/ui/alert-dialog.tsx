import { useEffect, useRef } from 'react';

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function AlertDialog({ open, onOpenChange, children }: AlertDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === overlayRef.current) onOpenChange(false);
      }}
    >
      <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div className="relative z-50 w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
        {children}
      </div>
    </div>
  );
}

export function AlertDialogTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{children}</h2>
  );
}

export function AlertDialogDescription({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">{children}</p>
  );
}

export function AlertDialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 flex justify-end gap-2">{children}</div>;
}

export function AlertDialogCancel({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
    >
      {children}
    </button>
  );
}

export function AlertDialogAction({ children, onClick, variant = 'default' }: { children: React.ReactNode; onClick?: () => void; variant?: 'default' | 'destructive' }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
        variant === 'destructive'
          ? 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800'
          : 'bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300'
      }`}
    >
      {children}
    </button>
  );
}
