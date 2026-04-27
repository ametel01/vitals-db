export default function Loading(): React.ReactElement {
  return (
    <div>
      <div className="kicker">
        <span>Endurance</span>
        <span>·</span>
        <span>Loading</span>
      </div>
      <h2 className="page-title">
        Performance, <em>fully instrumented.</em>
      </h2>
      <div className="composite-report">
        <div className="composite-report-head">
          <div>
            <div className="kicker">
              <span>Report answers</span>
              <span>·</span>
              <span>Preparing</span>
            </div>
            <h3 className="section-title compact">What changed, and what to do next</h3>
          </div>
          <div className="report-action">
            <span>Recommendation</span>
            <strong>Loading current report signals...</strong>
          </div>
        </div>
        <div className="composite-card-grid">
          {["Fitness direction", "Easy-run quality", "Recovery state", "Workout flags"].map(
            (title) => (
              <article className="composite-card is-mixed" key={title}>
                <div className="composite-card-topline">
                  <span>{title}</span>
                  <span className="tag warning">loading</span>
                </div>
                <h4>Loading report answer</h4>
                <div className="composite-sample-note">Waiting for recent composite samples.</div>
                <div className="composite-action">
                  <span>Status</span>
                  <strong>Fetching the latest performance report.</strong>
                </div>
              </article>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
