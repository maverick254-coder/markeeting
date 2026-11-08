/** Shown while a forum page loads from the forum service. */
export default function ForumLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <p className="sr-only">Loading the forum…</p>
      <div className="space-y-2">
        <div className="h-3 w-16 animate-pulse rounded bg-surface-active" />
        <div className="h-8 w-64 animate-pulse rounded-lg bg-surface-active" />
      </div>
      <ol className="divide-y divide-border-subtle overflow-hidden rounded-[20px] border border-border-subtle bg-white" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <li key={index} className="flex gap-5 px-5 py-4">
            <div className="hidden w-[6.5rem] space-y-2 sm:block">
              <div className="ml-auto h-3 w-12 animate-pulse rounded bg-surface-active" />
              <div className="ml-auto h-3 w-16 animate-pulse rounded bg-surface-active" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 animate-pulse rounded bg-surface-active" />
              <div className="h-3 w-full animate-pulse rounded bg-surface-raised" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-surface-raised" />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
