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
  };
}

function isUserEnteredMetadata(attrs: Attrs): boolean {
  return attr(attrs, "key") === USER_ENTERED_METADATA_KEY && attr(attrs, "value") === "1";
}

interface ParserState {
  current: ParsedNode | null;
  userEntered: boolean;
}

interface ParserHandle {
  parser: SaxesParser;
  queue: ParsedNode[];
  takeError(): Error | null;
}

function handleOpenTag(state: ParserState, rawTag: unknown): void {
  const tag = rawTag as SaxesTagPlain;
  const attrs = tag.attributes as Attrs;
  if (tag.name === "Record") {
    state.current = openRecord(attrs);
    state.userEntered = false;
    return;
  }
  if (tag.name === "Workout") {
    state.current = openWorkout(attrs);
    state.userEntered = false;
    return;
  }
  if (tag.name === "MetadataEntry" && state.current !== null && isUserEnteredMetadata(attrs)) {
    state.userEntered = true;
  }
}

function handleCloseTag(state: ParserState, queue: ParsedNode[], rawTag: unknown): void {
  const tag = rawTag as SaxesTagPlain;
  if (tag.name !== "Record" && tag.name !== "Workout") return;
  if (state.current !== null && !state.userEntered) {
    queue.push(state.current);
  }
  state.current = null;
  state.userEntered = false;
}

function createParserHandle(): ParserHandle {
  const parser = new SaxesParser();
  const queue: ParsedNode[] = [];
  const state: ParserState = { current: null, userEntered: false };
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
