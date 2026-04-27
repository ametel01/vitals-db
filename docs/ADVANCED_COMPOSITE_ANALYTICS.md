# Advanced Composite Analytics

Composite analytics combine multiple health and workout signals into higher-level reporting. These
are intended for future `/performance` reporting, where single charts are not enough to explain
fitness, fatigue, recovery, and workout quality.

The product goal is interpretation, not more charts. A paying user does not primarily want to know
that their resting HR, HRV, sleep, Z2 share, pace, and power changed. They want the system to answer:

- Am I getting fitter?
- Are my easy runs actually easy?
- Did my sleep or recovery affect this workout?
- Is my HR rising because of fatigue, illness, heat, poor pacing, or normal workload?
- What should I change next week?

Every composite below should therefore produce three layers:

- **Answer** — a short classification or recommendation.
- **Evidence** — the strongest 2-4 signals that explain the answer.
- **Action** — what to do next: push, maintain, reduce intensity, add sleep, run easier, or retest.

For a SaaS/report product, these explanations are the paid feature. The dashboard can still expose
the underlying charts, but the top-level experience should read like a training and recovery report.

## 1. Readiness Score

Combines:

- Resting HR trend
- HRV trend
- Sleep duration and sleep efficiency
- Recent training load

Report:

- Fresh
- Normal
- Strained

Answers:

- Did my sleep or recovery affect today's training readiness?
- Should I push, maintain, or take an easier day?

Useful detail:

- Show which input drove the score: elevated resting HR, suppressed HRV, poor sleep, or high load.
- Include a concise action, for example: "Keep intensity low today; HRV is below baseline and last
  night's sleep was short."

## 2. Training Strain vs Recovery

Combines:

- 7-day training load
- 28-day training load baseline
- Resting HR change
- HRV change

Report:

- Acute:chronic load ratio
- Recovery penalty
- Train, maintain, or easy-day signal

Answers:

- Is recent training stress appropriate relative to my normal baseline?
- Am I accumulating productive load or carrying too much fatigue?
- What should I change next week?

## 3. Aerobic Efficiency Trend

Combines:

- Pace at fixed HR
- Decoupling
- Z2 share
- Resting HR

Report:

- Whether pace is improving at the same HR
- Whether drift is decreasing at similar duration
- Whether Z2 work is actually staying in Z2

Answers:

- Am I getting fitter?
- Are my easy runs actually easy?
- Is my aerobic base improving independently of motivation, route, or one fast workout?

This is likely the highest-value advanced endurance metric for `/performance` and for a paid report.
It turns raw Apple Watch data into a clear statement like: "Your easy-run pace at 120-130 bpm is
improving, but Z2 compliance slipped this week."

## 4. Run Economy Score

Combines:

- Speed
- Power
- Vertical oscillation
- Ground contact time
- Stride length
- Heart rate

Possible derived metrics:

- Speed per watt
- Speed per bpm
- Watts per kg, if body mass is available
- Economy penalty for high vertical oscillation or long ground contact time

Answers:

- Am I moving faster for the same cardiovascular or mechanical cost?
- Is my performance change coming from fitness, power output, or mechanics?

## 5. Fitness Trend Composite

Combines:

- VO2 Max
- Pace at fixed HR
- Power trend
- Resting HR trend

Report:

- Improving
- Flat
- Declining

Answers:

- Am I getting fitter over the last 4-12 weeks?
- Is VO2 Max supported by real workout efficiency gains, or is it an isolated Apple estimate?

This should give a cleaner long-term fitness signal than VO2 Max alone. The report should explain
whether the conclusion is high-confidence or mixed, for example: "VO2 Max is flat, but fixed-HR pace
and resting HR improved, so aerobic fitness likely improved despite a stale VO2 estimate."

## 6. Fatigue Flag Per Run

Combines:

- Decoupling
- HR drift
- Pace drop
- Power drop
- Resting HR and HRV before the workout

Report each run as one of:

- Clean aerobic
- Cardiac drift
- Under-recovered
- Pacing fade
- Poor sample quality

Answers:

- Is my HR rising because of fatigue, illness, heat, poor pacing, or normal workload?
- Was this workout a clean aerobic session or a compromised session?
- Did sleep/recovery before the workout plausibly affect the result?

The first version can avoid overclaiming by reporting "likely" causes and always showing evidence:
pre-run resting HR/HRV, sleep duration, decoupling, HR drift, pace fade, power fade, route context,
and sample quality.

## 7. Load Quality

Combines:

- Training load
- Z2 share
- Workout type
- Duration
- Decoupling

Report:

- Productive aerobic load
- Junk intensity load
- High-strain, low-quality load

This reframes load from "more is better" to "what kind of load was accumulated?"

Answers:

- Are my hard weeks actually productive?
- Am I building aerobic base or collecting junk intensity?
- What should I adjust next week: volume, intensity, recovery, or consistency?

## 8. Recovery Debt

Combines:

- Sleep deficit
- Resting HR above baseline
- HRV below baseline
- Recent training load

Report:

- Positive score: carrying fatigue
- Near zero: balanced
- Negative score: well recovered

Answers:

- Is poor recovery a one-night issue or a rolling pattern?
- Should the next workouts be reduced because fatigue is accumulating?

Use a rolling 7-day value so the metric is stable enough for trend reporting.

## 9. Consistency Index

Combines:

- Weekly workout count
- Weekly workout duration
- Step count
- Sleep consistency
- Resting HR stability

Report:

- A high-level lifestyle and performance consistency score.
- Week-over-week direction.

Answers:

- Am I doing the basics consistently enough for the performance trend to mean anything?
- Is inconsistent sleep, steps, or workout frequency the limiting factor?

## 10. Workout Context Analytics

Combines newly parsed workout context:

- Workout metadata
- Workout events
- Workout routes
- Workout statistics
- Weather and elevation metadata where available

Possible reports:

- Outdoor vs indoor performance
- Paused vs unpaused pace
- Weather-adjusted comparisons
- Elevation-adjusted comparisons
- Route-backed vs non-route workout quality
- Segment count and pause count as workout-quality context

Answers:

- Is a worse run actually worse fitness, or was the route/context different?
- Are indoor/outdoor, pause behavior, or route conditions distorting the trend?
- Are there enough route/stat/event samples to trust the workout diagnosis?

## Report-Level Output

For an uploaded Apple Health export, the paid report should produce these sections before any raw
charts:

1. **Fitness direction** — improving, flat, or declining, with confidence and evidence.
2. **Easy-run quality** — whether easy runs stayed in Z2 and whether fixed-HR pace improved.
3. **Recovery state** — whether sleep, HRV, resting HR, and load suggest freshness or strain.
4. **Workout diagnoses** — recent runs labeled clean aerobic, drift, under-recovered, pacing fade,
   or poor sample quality.
5. **Next-week recommendation** — one concrete adjustment to volume, intensity, recovery, or
   consistency.

The recommendation should be conservative and evidence-backed. Avoid medical claims. Use language
like "suggests", "likely", and "worth watching" unless the data is directly measuring the stated
condition.

## Recommended Build Order

1. Aerobic Efficiency Trend
2. Fitness Trend Composite
3. Fatigue Flag Per Run
4. Readiness Score
5. Training Strain vs Recovery
6. Load Quality
7. Run Economy Score
8. Recovery Debt
9. Consistency Index
10. Workout Context Analytics

This order prioritizes the paid user questions first: "Am I getting fitter?", "Are my easy runs
actually easy?", "Why did this workout go badly?", and "What should I change next week?" Workout
mechanics and context analytics are still valuable, but they should support those answers rather
than become standalone chart collections.
