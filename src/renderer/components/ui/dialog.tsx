import { XIcon } from 'lucide-react';
import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

type DialogContextValue = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialogContext() {
  const context = useContext(DialogContext);

  if (!context) {
    throw new Error('Dialog components must be used within Dialog');
  }

  return context;
}

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onOpenChange]);

  return <DialogContext.Provider value={{ open, onOpenChange }}>{children}</DialogContext.Provider>;
}

interface DialogTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  children: ReactNode;
}

export function DialogTrigger({
  asChild = false,
  children,
  onClick,
  type,
  ...props
}: DialogTriggerProps) {
  const { onOpenChange } = useDialogContext();

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (!event.defaultPrevented) {
      onOpenChange(true);
    }
  };

  if (asChild && isValidElement(children)) {
    return cloneElement(children as ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>, {
      onClick: handleClick
    });
  }

  return (
    <button {...props} onClick={handleClick} type={type ?? 'button'}>
      {children}
    </button>
  );
}

interface DialogContentProps extends HTMLAttributes<HTMLDivElement> {
  showCloseButton?: boolean;
}

export function DialogContent({
  children,
  className,
  showCloseButton = true,
  ...props
}: DialogContentProps) {
  const { open, onOpenChange } = useDialogContext();
  const overlayRef = useRef<HTMLDivElement>(null);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4"
      onClick={(event) => {
        if (event.target === overlayRef.current) {
          onOpenChange(false);
        }
      }}
    >
      <div className="fixed inset-0 bg-black/50" />
      <div
        {...props}
        className={cn(
          'relative z-50 my-auto w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-lg dark:border-neutral-700 dark:bg-neutral-900',
          'max-h-[calc(100vh-2rem)] overflow-y-auto',
          className
        )}
      >
        {showCloseButton && (
          <button
            aria-label="Close dialog"
            className="absolute top-3 right-3 rounded-md p-1 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            <XIcon className="size-4" />
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}

export function DialogHeader({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={cn('flex flex-col gap-1.5', className)}>
      {children}
    </div>
  );
}

export function DialogTitle({ children, className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 {...props} className={cn('text-sm font-semibold text-neutral-900 dark:text-neutral-100', className)}>
      {children}
    </h2>
  );
}

export function DialogDescription({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p {...props} className={cn('text-xs text-neutral-500 dark:text-neutral-400', className)}>
      {children}
    </p>
  );
}
