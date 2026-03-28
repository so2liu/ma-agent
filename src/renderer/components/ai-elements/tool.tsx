"use client";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";
import type { BundledLanguage } from "shiki";
import { CodeBlock } from "./code-block";

export type ToolProps = ComponentProps<typeof Collapsible>;

export type ToolState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied";

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn("not-prose mb-4 w-full rounded-md border", className)}
    {...props}
  />
);

export type ToolHeaderProps = {
  title?: string;
  type?: string;
  state: ToolState;
  className?: string;
  disabled?: boolean;
  icon?: ReactNode;
};

const getStatusBadge = (status: ToolState) => {
  const labels: Record<ToolState, string> = {
    "input-streaming": "输入中",
    "input-available": "执行中",
    "approval-requested": "等待批准",
    "approval-responded": "已响应",
    "output-available": "已完成",
    "output-error": "失败",
    "output-denied": "已拒绝",
  };

  const icons: Record<ToolState, ReactNode> = {
    "input-streaming": <CircleIcon className="size-4" />,
    "input-available": <ClockIcon className="size-4 animate-pulse" />,
    "approval-requested": <ClockIcon className="size-4 text-yellow-600" />,
    "approval-responded": <CheckCircleIcon className="size-4 text-blue-600" />,
    "output-available": <CheckCircleIcon className="size-4 text-green-600" />,
    "output-error": <XCircleIcon className="size-4 text-red-600" />,
    "output-denied": <XCircleIcon className="size-4 text-orange-600" />,
  };

  return (
    <Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
      {icons[status]}
      {labels[status]}
    </Badge>
  );
};

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  disabled = false,
  icon,
  ...props
}: ToolHeaderProps) => {
  const content = (
    <div
      className={cn(
        "flex w-full items-center justify-between gap-4 p-3",
        disabled ? "cursor-default opacity-75" : "cursor-pointer",
        className
      )}
      {...props}
    >
      <div className="flex min-w-0 items-center gap-2">
        {icon ?? <WrenchIcon className="size-4 shrink-0 text-muted-foreground" />}
        <span className="truncate font-medium text-sm">
          {title ?? type ?? "Tool"}
        </span>
        {getStatusBadge(state)}
      </div>
      {!disabled && (
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      )}
    </div>
  );

  if (disabled) {
    return content;
  }

  return (
    <CollapsibleTrigger asChild>
      <button className="w-full bg-transparent text-left" type="button">
        {content}
      </button>
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input?: unknown;
  title?: string;
  language?: BundledLanguage;
};

function looksLikeJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function renderToolValue(value: unknown, language?: BundledLanguage) {
  if (value === undefined || value === null) {
    return null;
  }

  if (isValidElement(value)) {
    return value;
  }

  if (typeof value === "string") {
    const resolvedLanguage = language ?? (looksLikeJson(value) ? "json" : "markdown");
    return <CodeBlock code={value} language={resolvedLanguage} />;
  }

  return <CodeBlock code={JSON.stringify(value, null, 2)} language="json" />;
}

export const ToolInput = ({
  className,
  input,
  title = "Parameters",
  language,
  ...props
}: ToolInputProps) => {
  const content = renderToolValue(input, language);

  if (!content) {
    return null;
  }

  return (
    <div className={cn("space-y-2 overflow-hidden p-4", className)} {...props}>
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {title}
      </h4>
      <div className="rounded-md bg-muted/50">{content}</div>
    </div>
  );
};

export type ToolOutputProps = ComponentProps<"div"> & {
  output?: unknown;
  errorText?: string;
  title?: string;
  language?: BundledLanguage;
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  title,
  language,
  ...props
}: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }

  return (
    <div className={cn("space-y-2 p-4", className)} {...props}>
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {title ?? (errorText ? "Error" : "Result")}
      </h4>
      <div
        className={cn(
          "overflow-x-auto rounded-md text-xs [&_table]:w-full",
          errorText
            ? "bg-destructive/10 text-destructive"
            : "bg-muted/50 text-foreground"
        )}
      >
        {errorText ? renderToolValue(errorText, language) : renderToolValue(output, language)}
      </div>
    </div>
  );
};
