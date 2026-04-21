import type { ReactNode } from "react";

export interface CardTitleProps {
  title: ReactNode;
  tip?: string | undefined;
}

export function CardTitle({ title, tip }: CardTitleProps): React.ReactElement {
  return (
    <h2>
      <span className="card-title-text">{title}</span>
      {tip === undefined ? null : (
        <button type="button" className="info-tip" aria-label={tip} data-tip={tip}>
          <span aria-hidden="true">i</span>
          <span className="info-tip-bubble" role="tooltip">
            {tip}
          </span>
        </button>
      )}
    </h2>
  );
}
