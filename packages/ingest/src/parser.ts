import { type HKIdentifier, WorkoutActivityTypeSchema, isHKIdentifier } from "@vitals/core";
import { SaxesParser, type SaxesTagPlain } from "saxes";

export interface ParsedRecord {
  kind: "record";
  type: HKIdentifier;
  startDate: string;
  endDate: string;
  value: string | null;
  sourceName: string | null;
  unit: string | null;
}

export interface ParsedWorkout {
  kind: "workout";
  workoutActivityType: string;
  startDate: string;
  endDate: string;
  duration: string | null;
  durationUnit: string | null;
  sourceName: string | null;
  statistics: ParsedWorkoutStatistic[];
  events: ParsedWorkoutEvent[];
  metadata: ParsedMetadataEntry[];
  routes: ParsedWorkoutRoute[];
}

export interface ParsedWorkoutStatistic {
  type: string;
  startDate: string;
  endDate: string;
  average: string | null;
  minimum: string | null;
  maximum: string | null;
  sum: string | null;
  unit: string | null;
}

export interface ParsedWorkoutEvent {
  type: string;
  date: string;
  duration: string | null;
  durationUnit: string | null;
}

export interface ParsedMetadataEntry {
  key: string;
  value: string;
}

export interface ParsedWorkoutRoute {
  startDate: string;
  endDate: string;
  sourceName: string | null;
  path: string | null;
}

export type ParsedNode = ParsedRecord | ParsedWorkout;

const USER_ENTERED_METADATA_KEY = "HKWasUserEntered";

type Attrs = Record<string, string>;

function attr(attrs: Attrs, key: string): string | null {
  return Object.hasOwn(attrs, key) ? (attrs[key] ?? null) : null;
}

function openRecord(attrs: Attrs): ParsedRecord | null {
  const type = attr(attrs, "type");
  if (type === null || !isHKIdentifier(type)) return null;
  return {
    kind: "record",
    type,
    startDate: attr(attrs, "startDate") ?? "",
    endDate: attr(attrs, "endDate") ?? "",
    value: attr(attrs, "value"),
    sourceName: attr(attrs, "sourceName"),
    unit: attr(attrs, "unit"),
  };
}

function openWorkout(attrs: Attrs): ParsedWorkout | null {
  const activityType = attr(attrs, "workoutActivityType");
  if (activityType === null || !WorkoutActivityTypeSchema.safeParse(activityType).success) {
    return null;
  }
  return {
    kind: "workout",
    workoutActivityType: activityType,
    startDate: attr(attrs, "startDate") ?? "",
    endDate: attr(attrs, "endDate") ?? "",
    duration: attr(attrs, "duration"),
    durationUnit: attr(attrs, "durationUnit"),
    sourceName: attr(attrs, "sourceName"),
    statistics: [],
    events: [],
    metadata: [],
    routes: [],
  };
}

function openWorkoutStatistic(attrs: Attrs): ParsedWorkoutStatistic | null {
  const type = attr(attrs, "type");
  if (type === null) return null;
  return {
    type,
    startDate: attr(attrs, "startDate") ?? "",
    endDate: attr(attrs, "endDate") ?? "",
    average: attr(attrs, "average"),
    minimum: attr(attrs, "minimum"),
    maximum: attr(attrs, "maximum"),
    sum: attr(attrs, "sum"),
    unit: attr(attrs, "unit"),
  };
}

function openWorkoutEvent(attrs: Attrs): ParsedWorkoutEvent | null {
  const type = attr(attrs, "type");
  const date = attr(attrs, "date");
  if (type === null || date === null) return null;
  return {
    type,
    date,
    duration: attr(attrs, "duration"),
    durationUnit: attr(attrs, "durationUnit"),
  };
}

function openWorkoutRoute(attrs: Attrs): ParsedWorkoutRoute {
  return {
    startDate: attr(attrs, "startDate") ?? "",
    endDate: attr(attrs, "endDate") ?? "",
    sourceName: attr(attrs, "sourceName"),
    path: null,
  };
}

function isUserEnteredMetadata(attrs: Attrs): boolean {
  return attr(attrs, "key") === USER_ENTERED_METADATA_KEY && attr(attrs, "value") === "1";
}

function appendWorkoutMetadata(workout: ParsedWorkout, attrs: Attrs): void {
  const key = attr(attrs, "key");
  const value = attr(attrs, "value");
  if (key !== null && value !== null) workout.metadata.push({ key, value });
}

interface ParserState {
  current: ParsedNode | null;
  currentRoute: ParsedWorkoutRoute | null;
  userEntered: boolean;
}

interface ParserHandle {
  parser: SaxesParser;
  queue: ParsedNode[];
  takeError(): Error | null;
}

function handleTopLevelOpenTag(state: ParserState, tagName: string, attrs: Attrs): boolean {
  if (tagName === "Record") {
    state.current = openRecord(attrs);
    state.userEntered = false;
    return true;
  }
  if (tagName === "Workout") {
    state.current = openWorkout(attrs);
    state.currentRoute = null;
    state.userEntered = false;
    return true;
  }
  return false;
}

function handleWorkoutChildOpenTag(state: ParserState, tagName: string, attrs: Attrs): void {
  if (state.current?.kind !== "workout") return;
  const workout = state.current;

  switch (tagName) {
    case "WorkoutStatistics": {
      const statistic = openWorkoutStatistic(attrs);
      if (statistic !== null) workout.statistics.push(statistic);
      return;
    }
    case "WorkoutEvent": {
      const event = openWorkoutEvent(attrs);
      if (event !== null) workout.events.push(event);
      return;
    }
    case "WorkoutRoute":
      state.currentRoute = openWorkoutRoute(attrs);
      return;
    case "FileReference":
      if (state.currentRoute !== null) state.currentRoute.path = attr(attrs, "path");
      return;
    case "MetadataEntry":
      if (state.currentRoute === null) appendWorkoutMetadata(workout, attrs);
      return;
  }
}

function handleOpenTag(state: ParserState, rawTag: unknown): void {
  const tag = rawTag as SaxesTagPlain;
  const attrs = tag.attributes as Attrs;
  if (handleTopLevelOpenTag(state, tag.name, attrs)) return;
  handleWorkoutChildOpenTag(state, tag.name, attrs);
  if (tag.name === "MetadataEntry" && state.current !== null && isUserEnteredMetadata(attrs)) {
    state.userEntered = true;
  }
}

function handleCloseTag(state: ParserState, queue: ParsedNode[], rawTag: unknown): void {
  const tag = rawTag as SaxesTagPlain;
  if (tag.name === "WorkoutRoute" && state.current?.kind === "workout") {
    if (state.currentRoute !== null) state.current.routes.push(state.currentRoute);
    state.currentRoute = null;
    return;
  }
  if (tag.name !== "Record" && tag.name !== "Workout") return;
  if (state.current !== null && !state.userEntered) {
    queue.push(state.current);
  }
  state.current = null;
  state.currentRoute = null;
  state.userEntered = false;
}

function createParserHandle(): ParserHandle {
  const parser = new SaxesParser();
  const queue: ParsedNode[] = [];
  const state: ParserState = { current: null, currentRoute: null, userEntered: false };
  let parseError: Error | null = null;

  parser.on("opentag", (rawTag) => handleOpenTag(state, rawTag));
  parser.on("closetag", (rawTag) => handleCloseTag(state, queue, rawTag));
  parser.on("error", (err) => {
    parseError = err instanceof Error ? err : new Error(String(err));
  });

  return {
    parser,
    queue,
    takeError: () => parseError,
  };
}

function* drainQueue(queue: ParsedNode[]): IterableIterator<ParsedNode> {
  while (queue.length > 0) {
    const next = queue.shift();
    if (next !== undefined) yield next;
  }
}

export async function* parseHealthExport(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<ParsedNode> {
  const handle = createParserHandle();
  const decoder = new TextDecoder("utf-8");
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk.length > 0) handle.parser.write(chunk);
      const err = handle.takeError();
      if (err !== null) throw err;
      yield* drainQueue(handle.queue);
    }
    const tail = decoder.decode();
    if (tail.length > 0) handle.parser.write(tail);
    handle.parser.close();
    const err = handle.takeError();
    if (err !== null) throw err;
    yield* drainQueue(handle.queue);
  } finally {
    reader.releaseLock();
  }
}

export async function* parseHealthExportString(xml: string): AsyncIterable<ParsedNode> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(xml));
      controller.close();
    },
  });
  yield* parseHealthExport(stream);
}
