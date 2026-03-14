export default function DropZoneOverlay() {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/18 backdrop-blur-sm transition-opacity duration-200">
      <div className="rounded-3xl border border-white/70 bg-white/88 px-8 py-6 shadow-2xl ring-1 ring-black/5 dark:border-neutral-700/80 dark:bg-neutral-900/88 dark:ring-white/10">
        <p className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">松开以添加文件</p>
      </div>
    </div>
  );
}
