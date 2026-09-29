import Link from "next/link";

type EmptyStateProps = {
  eyebrow: string;
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
  note?: string;
};

export function EmptyState({
  eyebrow,
  title,
  body,
  actionHref,
  actionLabel,
  note,
}: EmptyStateProps) {
  return (
    <section className="empty-state" aria-labelledby="empty-state-title">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id="empty-state-title">{title}</h2>
      <p className="empty-state-copy">{body}</p>
      {actionHref && actionLabel ? (
        <Link className="text-link" href={actionHref}>
          {actionLabel}
          <span aria-hidden="true"> →</span>
        </Link>
      ) : null}
      {note ? <p className="empty-state-note">{note}</p> : null}
    </section>
  );
}
