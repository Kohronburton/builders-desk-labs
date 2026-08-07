import { createHash } from "node:crypto";
import type { PaidOrder } from "../contracts/paid-order.js";

export interface ScriptSegment {
  sequence: number;
  speakerCode?: string;
  text: string;
  wordCount: number;
  characterCount: number;
  checksumSha256: string;
}

export interface SegmentationResult {
  version: string;
  normalizedText: string;
  wordCount: number;
  segments: ScriptSegment[];
}

export interface Segmenter {
  segment(order: PaidOrder): SegmentationResult;
}

function countWords(text: string): number {
  const normalized = text.trim();
  return normalized ? normalized.split(/\s+/u).length : 0;
}

export class DraftSpeakerTurnSegmenter implements Segmenter {
  readonly version = "PLACEHOLDER-speaker-turn-v1";

  segment(order: PaidOrder): SegmentationResult {
    const normalizedText = order.script.text.replace(/\r\n?/gu, "\n").trim();
    const speakerCodes = new Set(order.script.speakers.map((speaker) => speaker.speakerCode));
    const blocks = normalizedText.split(/\n\s*\n/gu).map((block) => block.trim()).filter(Boolean);
    const segments = blocks.map((block, index): ScriptSegment => {
      const firstLine = block.split("\n", 1)[0] ?? "";
      const match = /^([A-Z0-9][A-Z0-9_-]*):\s*/u.exec(firstLine);
      const speakerCode = match?.[1] && speakerCodes.has(match[1]) ? match[1] : undefined;
      const text = block;
      return {
        sequence: index + 1,
        ...(speakerCode ? { speakerCode } : {}),
        text,
        wordCount: countWords(text),
        characterCount: text.length,
        checksumSha256: createHash("sha256").update(text).digest("hex")
      };
    });
    return {
      version: this.version,
      normalizedText,
      wordCount: countWords(normalizedText),
      segments
    };
  }
}

export function assertPricingParity(order: PaidOrder, result: SegmentationResult): void {
  if (order.script.declaredWordCount !== result.wordCount) {
    throw new Error(`WORD_COUNT_MISMATCH:${order.script.declaredWordCount}:${result.wordCount}`);
  }
  if (order.script.declaredSegmentCount !== result.segments.length) {
    throw new Error(`SEGMENT_COUNT_MISMATCH:${order.script.declaredSegmentCount}:${result.segments.length}`);
  }
}
