export default function TasksLoading() {
  return (
    <div className="aui-page max-w-6xl">
      <div className="h-3 w-16 animate-pulse rounded-full bg-muted" />
      <div className="mt-3 h-8 w-40 animate-pulse rounded-lg bg-muted" />
      <div className="mt-2 h-3 w-96 max-w-full animate-pulse rounded-full bg-muted" />

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, column) => (
          <div key={column} className="rounded-2xl border border-border bg-card/60 p-2.5">
            <div className="flex items-center gap-2 pb-2">
              <div className="size-3 animate-pulse rounded-full bg-muted" />
              <div className="h-3 w-24 animate-pulse rounded-full bg-muted" />
            </div>
            <div className="h-8 animate-pulse rounded-lg bg-muted" />
            <div className="mt-2 space-y-1.5">
              {Array.from({ length: 2 }).map((__, card) => (
                <div key={card} className="h-20 animate-pulse rounded-xl bg-muted/70" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
