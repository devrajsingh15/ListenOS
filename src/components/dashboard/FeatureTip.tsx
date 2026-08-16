interface FeatureTipProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function FeatureTip({
  title,
  description,
  actionLabel = "Open guide",
  onAction,
}: FeatureTipProps) {
  return (
    <section className="animate-fade-in ui-surface-panel rounded-df p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-normal uppercase tracking-[0.14em] text-muted-foreground">Workflow Tip</p>
          <h2 className="mt-2 text-xl font-normal text-foreground">{title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>

        {actionLabel && (
          <button
            onClick={onAction}
            className="ui-button ui-button-primary inline-flex items-center justify-center rounded-df border border-transparent bg-primary px-4 py-2.5 text-sm font-normal text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </section>
  );
}

