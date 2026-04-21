import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import type { WriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { WorkoutActivityTypeSchema, isHKIdentifier } from "@vitals/core";
import { hkDateToMs } from "./mappers";

const USER_ENTERED_METADATA_PATTERN =
  /<MetadataEntry\b[^>]*(?:key="HKWasUserEntered"[^>]*value="1"|value="1"[^>]*key="HKWasUserEntered")[^>]*\/?>/s;

type NodeKind = "Record" | "Workout";

interface PendingNode {
  kind: NodeKind;
  lines: string[];
}

interface CropState {
  cutoffMs: number | null;
  locale: string;
  output: WriteStream;
  pending: PendingNode | null;
  preamble: string[];
  stats: CropStats;
  wroteHeader: boolean;
}

export interface CropStats {
  nodesSeen: number;
  nodesKept: number;
  droppedBeforeCutoff: number;
  droppedUnsupported: number;
  droppedUserEntered: number;
}

export interface CropResult {
  outputPath: string;
  stats: CropStats;
}

export interface CropHealthExportOptions {
  cutoffMs: number | null;
  outputPath: string;
}

function emptyCropStats(): CropStats {
  return {
    nodesSeen: 0,
    nodesKept: 0,
    droppedBeforeCutoff: 0,
    droppedUnsupported: 0,
    droppedUserEntered: 0,
  };
}

function parseAttributes(line: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const matches = line.matchAll(/([A-Za-z][A-Za-z0-9]*)="([^"]*)"/g);
  for (const match of matches) {
    const [, key, value] = match;
    if (key !== undefined && value !== undefined) attrs[key] = value;
  }
  return attrs;
}

function parseLocale(line: string): string | null {
  const match = line.match(/\blocale="([^"]+)"/);
  return match?.[1] ?? null;
}

function isNodeStart(line: string): NodeKind | null {
  if (line.startsWith("<Record ")) return "Record";
  if (line.startsWith("<Workout ")) return "Workout";
  return null;
}

function isNodeCompleteOnSameLine(kind: NodeKind, line: string): boolean {
  return line.endsWith("/>") || line.includes(`</${kind}>`);
}

function hasUserEnteredMetadata(lines: string[]): boolean {
  return USER_ENTERED_METADATA_PATTERN.test(lines.join("\n"));
}

function shouldKeepRecord(
  attrs: Record<string, string>,
  lines: string[],
  cutoffMs: number | null,
  stats: CropStats,
): boolean {
  const type = attrs.type;
  const endDate = attrs.endDate;
  if (type === undefined || endDate === undefined || !isHKIdentifier(type)) {
    stats.droppedUnsupported++;
    return false;
  }
  if (hasUserEnteredMetadata(lines)) {
    stats.droppedUserEntered++;
    return false;
  }
  if (cutoffMs === null) return true;
  try {
    if (hkDateToMs(endDate) < cutoffMs) {
      stats.droppedBeforeCutoff++;
      return false;
    }
  } catch {
    stats.droppedUnsupported++;
    return false;
  }
  return true;
}

function shouldKeepWorkout(
  attrs: Record<string, string>,
  cutoffMs: number | null,
  stats: CropStats,
): boolean {
  const activityType = attrs.workoutActivityType;
  const endDate = attrs.endDate;
  if (
    activityType === undefined ||
    endDate === undefined ||
    !WorkoutActivityTypeSchema.safeParse(activityType).success
  ) {
    stats.droppedUnsupported++;
    return false;
  }
  if (cutoffMs === null) return true;
  try {
    if (hkDateToMs(endDate) < cutoffMs) {
      stats.droppedBeforeCutoff++;
      return false;
    }
  } catch {
    stats.droppedUnsupported++;
    return false;
  }
  return true;
}

function shouldKeepNode(node: PendingNode, cutoffMs: number | null, stats: CropStats): boolean {
  stats.nodesSeen++;
  const attrs = parseAttributes(node.lines[0] ?? "");
  if (node.kind === "Record") return shouldKeepRecord(attrs, node.lines, cutoffMs, stats);
  return shouldKeepWorkout(attrs, cutoffMs, stats);
}

function ensureHeader(state: CropState): void {
  if (state.wroteHeader) return;
  state.output.write('<?xml version="1.0" encoding="UTF-8"?>\n');
  state.output.write(`<HealthData locale="${state.locale}">\n`);
  for (const line of state.preamble) state.output.write(`${line}\n`);
  state.wroteHeader = true;
}

function flushPendingNode(state: CropState): void {
  const { pending } = state;
  if (pending === null) return;
  if (shouldKeepNode(pending, state.cutoffMs, state.stats)) {
    ensureHeader(state);
    state.output.write(`${pending.lines.join("\n")}\n`);
    state.stats.nodesKept++;
  }
  state.pending = null;
}

function handleOutsideNodeLine(state: CropState, line: string): void {
  const trimmed = line.trimStart();
  const nextLocale = parseLocale(trimmed);
  if (nextLocale !== null) state.locale = nextLocale;

  if (trimmed.startsWith("<ExportDate ") || trimmed.startsWith("<Me ")) {
    state.preamble.push(line);
    return;
  }

  const kind = isNodeStart(trimmed);
  if (kind === null) return;

  state.pending = { kind, lines: [line] };
  if (isNodeCompleteOnSameLine(kind, trimmed)) flushPendingNode(state);
}

function handlePendingNodeLine(state: CropState, line: string): void {
  const pending = state.pending;
  if (pending === null) return;
  pending.lines.push(line);
  if (line.trimStart().startsWith(`</${pending.kind}>`)) flushPendingNode(state);
}

export async function cropHealthExport(
  inputPath: string,
  opts: CropHealthExportOptions,
): Promise<CropResult> {
  const outputPath = resolve(opts.outputPath);
  await mkdir(dirname(outputPath), { recursive: true });

  const input = createReadStream(inputPath, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
  const output = createWriteStream(outputPath, { encoding: "utf8" });
  const state: CropState = {
    cutoffMs: opts.cutoffMs,
    locale: "en_GB",
    output,
    pending: null,
    preamble: [],
    stats: emptyCropStats(),
    wroteHeader: false,
  };

  try {
    for await (const rawLine of lines) {
      if (state.pending !== null) {
        handlePendingNodeLine(state, rawLine);
      } else {
        handleOutsideNodeLine(state, rawLine);
      }
    }

    if (state.pending !== null) {
      throw new Error(`unterminated ${state.pending.kind} node while cropping ${inputPath}`);
    }

    ensureHeader(state);
    output.end("</HealthData>\n");
    await once(output, "finish");
  } catch (err) {
    output.destroy();
    throw err;
  } finally {
    lines.close();
  }

  return { outputPath, stats: state.stats };
}
