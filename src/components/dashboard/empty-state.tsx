import * as React from "react";

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({
  title = "Nothing here yet",
  description = "Select a conversation or connection to get started.",
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      <div>
        <p className="text-lg font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}