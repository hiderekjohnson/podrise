/**
 * HARD RULE: All AI analysis of transcripts MUST use the FULL transcript.
 * Never truncate, slice, or skip portions of a transcript before sending to AI.
 *
 * This module provides a chunking utility that splits long transcripts into
 * manageable pieces while guaranteeing 100% coverage.
 *
 * Usage:
 *   import { chunkTranscript, processFullTranscript } from "./transcriptChunker";
 *   const chunks = chunkTranscript(transcript);
 *   // Process each chunk with AI, then deduplicate/merge results
 */

const DEFAULT_CHUNK_SIZE = 28000;

export function chunkTranscript(transcript: string, chunkSize: number = DEFAULT_CHUNK_SIZE): string[] {
  const text = (transcript || "").trim();
  if (!text) return [];

  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }

  const totalChars = chunks.reduce((sum, c) => sum + c.length, 0);
  if (totalChars !== text.length) {
    throw new Error(
      `TRANSCRIPT COVERAGE ERROR: chunked ${totalChars} chars but transcript is ${text.length} chars. This violates the full-transcript rule.`
    );
  }

  return chunks;
}

export interface TranscriptCoverage {
  totalChars: number;
  chunkCount: number;
  coveragePct: number;
}

export async function processFullTranscript<T>(
  transcript: string,
  processChunk: (chunk: string, chunkIndex: number, totalChunks: number) => Promise<T[]>,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): Promise<{ results: T[]; coverage: TranscriptCoverage }> {
  const chunks = chunkTranscript(transcript, chunkSize);

  if (chunks.length === 0) {
    return {
      results: [],
      coverage: { totalChars: 0, chunkCount: 0, coveragePct: 0 },
    };
  }

  const allResults: T[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkResults = await processChunk(chunks[i], i, chunks.length);
    allResults.push(...chunkResults);
  }

  const totalChars = (transcript || "").trim().length;

  return {
    results: allResults,
    coverage: {
      totalChars,
      chunkCount: chunks.length,
      coveragePct: 100,
    },
  };
}
