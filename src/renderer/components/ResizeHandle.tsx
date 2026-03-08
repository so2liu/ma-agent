import { Separator } from 'react-resizable-panels';

export default function ResizeHandle() {
  return (
    <Separator className="group relative w-0 shrink-0">
      {/* Invisible wider hit area */}
      <div className="absolute top-0 bottom-0 -left-1.5 w-3 cursor-col-resize" />
      {/* Visible line */}
      <div className="resize-handle-line absolute top-0 bottom-0 left-0 w-px transition-colors group-hover:!bg-blue-400 group-data-[resize-handle-active]:!bg-blue-500 dark:group-hover:!bg-blue-500 dark:group-data-[resize-handle-active]:!bg-blue-500" />
    </Separator>
  );
}
