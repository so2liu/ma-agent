import {
  Children,
  cloneElement,
  isValidElement,
  useMemo,
  useState,
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type ReactElement,
  type ReactNode
} from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const CODE_COLLAPSE_LINE_THRESHOLD = 200;

function flattenTextContent(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map((child) => flattenTextContent(child)).join('');
  }

  if (isValidElement(node)) {
    return flattenTextContent((node.props as { children?: ReactNode }).children);
  }

  return '';
}

// Custom link component that opens external links in the system browser
const ExternalLink: Components['a'] = ({ href, children, ...props }) => {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (href) {
      window.electron.shell.openExternal(href).catch((error) => {
        console.error('Failed to open external link:', error);
      });
    }
  };

  return (
    <a href={href} onClick={handleClick} {...props}>
      {children}
    </a>
  );
};

function CollapsiblePre({ children, ...props }: ComponentPropsWithoutRef<'pre'>) {
  const childArray = Children.toArray(children);
  const codeChild = childArray[0];
  const codeElement =
    isValidElement(codeChild) ? (codeChild as ReactElement<{ children?: ReactNode }>) : null;
  const rawCode = useMemo(
    () => (codeElement ? flattenTextContent(codeElement.props.children) : ''),
    [codeElement]
  );
  const normalizedCode = rawCode.replace(/\n$/, '');
  const lineCount = normalizedCode.length === 0 ? 0 : normalizedCode.split('\n').length;

  if (!codeElement) {
    return <pre {...props}>{children}</pre>;
  }

  return (
    <CollapsibleCodeBlock
      key={normalizedCode}
      codeElement={codeElement}
      rawCode={rawCode}
      lineCount={lineCount}
      preProps={props}
    />
  );
}

function CollapsibleCodeBlock({
  codeElement,
  rawCode,
  lineCount,
  preProps
}: {
  codeElement: ReactElement<{ children?: ReactNode }>;
  rawCode: string;
  lineCount: number;
  preProps: ComponentPropsWithoutRef<'pre'>;
}) {
  const isCollapsible = lineCount > CODE_COLLAPSE_LINE_THRESHOLD;
  const [isExpanded, setIsExpanded] = useState(!isCollapsible);
  const normalizedCode = rawCode.replace(/\n$/, '');

  const displayedCode =
    isCollapsible && !isExpanded ?
      normalizedCode.split('\n').slice(0, CODE_COLLAPSE_LINE_THRESHOLD).join('\n')
    : rawCode;

  return (
    <div className="not-prose">
      <pre {...preProps}>{cloneElement(codeElement, { children: displayedCode })}</pre>
      {isCollapsible && (
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="mt-2 inline-flex rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {isExpanded ? '收起代码' : '展开完整代码'}
        </button>
      )}
    </div>
  );
}

// Custom components for ReactMarkdown
const markdownComponents: Components = {
  a: ExternalLink,
  pre: CollapsiblePre
};

interface MarkdownProps {
  children: string;
}

export default function Markdown({ children }: MarkdownProps) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {children}
    </ReactMarkdown>
  );
}
