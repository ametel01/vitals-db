export default function Loading(): React.ReactElement {
  return (
    <div className="performance-dashboard">
      <header className="performance-header">
        <div className="performance-heading">
          <div className="kicker">
            <span>Endurance</span>
            <span>·</span>
            <span>Loading</span>
          </div>
          <h2 className="page-title">
            Performance, <em>fully instrumented.</em>
          </h2>
          <p className="page-subtitle">
            Trend reporting across aerobic fitness, training load, workout quality, and running
            efficiency to help you train smarter and recover deeper.
          </p>
        </div>
        <div className="performance-header-tools">
          <div className="date-range-control performance-date-control">
            <span aria-hidden="true">▦</span>
            <span>Preparing range</span>
            <span aria-hidden="true">⌄</span>
          </div>
          <aside className="forecast-card warning">
            <div>
              <span className="forecast-label">Next week intensity</span>
              <strong>Loading current report signals...</strong>
            </div>
            <div className="skeleton-sparkline" />
          </aside>
        </div>
      </header>

      <section className="insight-grid" aria-label="Loading performance insights">
        {["Fitness direction", "Load quality", "Recovery debt", "Workout flags"].map((title) => (
          <article className="insight-card warning" key={title}>
            <div className="insight-card-topline">
              <span className="insight-icon lime" aria-hidden="true">
                ✦
              </span>
              <span>{title}</span>
              <span className="tag warning">loading</span>
            </div>
            <h3>Loading report answer</h3>
            <div className="skeleton-bars" />
            <div className="insight-footer">
              <span>Awaiting samples</span>
              <span>report loading</span>
            </div>
          </article>
        ))}
      </section>

      <section className="metric-sparkline-grid" aria-label="Loading primary metrics">
        {["VO2 Max", "Resting HR", "HRV", "Training Load"].map((title) => (
          <article className="metric-sparkline-card lime" key={title}>
            <h2>{title}</h2>
            <div className="metric-card-value">
              <strong>--</strong>
            </div>
            <div className="metric-card-context">Loading trend</div>
            <div className="skeleton-sparkline" />
          </article>
        ))}
      </section>

      <div className="card primary-trend-card">
        <div className="trend-card-header">
          <h2>Aerobic efficiency trend</h2>
          <span className="trend-range-control">90D ⌄</span>
        </div>
        <div className="skeleton-chart" />
        <div className="insight-strip">
          <span aria-hidden="true">✚</span>
          <strong>Insight</strong>
          <p>Loading combined trend interpretation.</p>
        </div>
      </div>
    </div>
  );
}
