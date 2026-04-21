export interface ErrorBannerProps {
  title: string;
  detail?: string;
}

export function ErrorBanner({ title, detail }: ErrorBannerProps): React.ReactElement {
  return (
    <div className="error-banner">
      <strong>{title}</strong>
      {detail === undefined ? null : <div style={{ marginTop: 4, opacity: 0.85 }}>{detail}</div>}
    </div>
  );
}
