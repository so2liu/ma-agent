/**
 * Drag region for the content area (right of sidebar).
 * Provides macOS title-bar-style dragging without visible chrome.
 */
export default function TitleBar() {
  return (
    <div className="pointer-events-none absolute top-0 right-0 left-0 z-40 h-12 [-webkit-app-region:drag]" />
  );
}
