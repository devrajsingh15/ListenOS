"use client";

interface FeatureTipProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function FeatureTip({
  title,
  description,
  actionLabel = "Show me how",
  onAction,
}: FeatureTipProps) {
  return (
    <div className="rounded-xl bg-card-feature p-6">
      <h2 className="mb-2 text-xl font-semibold text-foreground">{title}</h2>
      <p className="mb-4 text-sm text-muted">{description}</p>
      {actionLabel && (
        <button
          onClick={onAction}
          className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-foreground/90"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

