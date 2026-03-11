import type { InsertTranscriptSegment } from "@shared/schema";

interface RawTaddySegment {
  id: string;
  text: string;
  speaker: string | null;
  startTimecode: number | null;
  endTimecode: number | null;
}

function cleanText(text: string): string {
  let t = text.trim();
  t = t.replace(/[\u2018\u2019\u201A\u201B]/g, "'");
  t = t.replace(/[\u201C\u201D\u201E\u201F]/g, '"');
  t = t.replace(/\u2026/g, "...");
  t = t.replace(/\u2013|\u2014/g, "-");
  t = t.replace(/\s{2,}/g, " ");
  t = t.replace(/(\b\w+\b)(\s+\1){2,}/gi, "$1");
  t = t.replace(/\b(I|i)\s+\1\s+\1\b/g, "$1");
  t = t.replace(/\b(uh|um|ah|eh)(\s+(uh|um|ah|eh)){2,}\b/gi, "$1");
  t = t.replace(/([.!?])\1{2,}/g, "$1");
  t = t.replace(/\s([.,!?;:])/g, "$1");
  t = t.replace(/([.!?])\s*([.!?])\s*([.!?])+/g, "$1");
  return t.trim();
}

function formatTimestampLabel(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function generateAnchorId(seconds: number | null, index: number): string {
  if (seconds != null && seconds >= 0) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `t-${h}h${m.toString().padStart(2, "0")}m${s.toString().padStart(2, "0")}s`;
    }
    return `t-${m}m${s.toString().padStart(2, "0")}s`;
  }
  return `seg-${index}`;
}

function deduplicateAnchors(segments: InsertTranscriptSegment[]): InsertTranscriptSegment[] {
  const seen = new Set<string>();
  return segments.map((seg) => {
    let anchor = seg.anchorId;
    if (seen.has(anchor)) {
      let suffix = 2;
      while (seen.has(`${anchor}-${suffix}`)) suffix++;
      anchor = `${anchor}-${suffix}`;
    }
    seen.add(anchor);
    return { ...seg, anchorId: anchor };
  });
}

export function parseRawTaddySegments(
  taddySegments: RawTaddySegment[],
  podcastSlug: string,
  episodeSlug: string,
  episodeGuid: string,
  transcriptId?: number
): InsertTranscriptSegment[] {
  const segments: InsertTranscriptSegment[] = [];

  let currentSpeaker: string | null = null;
  let currentText = "";
  let currentStartTime: number | null = null;
  let segIndex = 0;

  const flush = () => {
    const cleaned = cleanText(currentText);
    if (!cleaned) return;
    segments.push({
      transcriptId: transcriptId ?? null,
      episodeGuid,
      podcastSlug,
      episodeSlug,
      sequenceIndex: segIndex,
      timestampSeconds: currentStartTime,
      timestampLabel: currentStartTime != null ? formatTimestampLabel(currentStartTime) : null,
      speakerName: currentSpeaker,
      text: cleaned,
      anchorId: generateAnchorId(currentStartTime, segIndex),
    });
    segIndex++;
  };

  for (const seg of taddySegments) {
    const speaker = seg.speaker?.trim() || null;
    const text = seg.text?.trim() || "";
    if (!text) continue;

    const startSec = seg.startTimecode != null ? Math.floor(seg.startTimecode / 1000) : null;

    const speakerChanged = speaker !== currentSpeaker;
    const tooLong = currentText.length > 400;
    const hasNewTimestamp = startSec != null;
    const shouldSplit = speakerChanged || (tooLong && hasNewTimestamp);

    if (shouldSplit) {
      if (currentText) flush();
      currentSpeaker = speaker;
      currentText = text;
      currentStartTime = startSec;
    } else {
      currentText += " " + text;
      if (currentStartTime == null && startSec != null) {
        currentStartTime = startSec;
      }
    }
  }

  if (currentText) flush();

  return deduplicateAnchors(segments);
}

export function parseTranscriptToSegments(
  rawText: string,
  podcastSlug: string,
  episodeSlug: string,
  episodeGuid: string,
  transcriptId?: number
): InsertTranscriptSegment[] {
  const segments: InsertTranscriptSegment[] = [];
  const lines = rawText.split("\n").filter((l) => l.trim());

  let currentSpeaker: string | null = null;
  let currentText = "";
  let currentTimestamp: number | null = null;
  let segIndex = 0;

  const flush = () => {
    const cleaned = cleanText(currentText);
    if (!cleaned) return;
    segments.push({
      transcriptId: transcriptId ?? null,
      episodeGuid,
      podcastSlug,
      episodeSlug,
      sequenceIndex: segIndex,
      timestampSeconds: currentTimestamp,
      timestampLabel: currentTimestamp != null ? formatTimestampLabel(currentTimestamp) : null,
      speakerName: currentSpeaker,
      text: cleaned,
      anchorId: generateAnchorId(currentTimestamp, segIndex),
    });
    segIndex++;
  };

  const speakerPattern = /^\[([^\]]+)\]\s*/;
  const timestampPattern = /^\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s*/;

  for (const line of lines) {
    let remaining = line.trim();

    let lineTimestamp: number | null = null;
    const tsMatch = remaining.match(timestampPattern);
    if (tsMatch && !remaining.match(/^\[\w+.*\]\s/)) {
      const parts = tsMatch;
      if (parts[3] != null) {
        lineTimestamp = parseInt(parts[1]) * 3600 + parseInt(parts[2]) * 60 + parseInt(parts[3]);
      } else {
        lineTimestamp = parseInt(parts[1]) * 60 + parseInt(parts[2]);
      }
      remaining = remaining.slice(tsMatch[0].length);
    }

    let lineSpeaker: string | null = null;
    const spMatch = remaining.match(speakerPattern);
    if (spMatch) {
      lineSpeaker = spMatch[1].trim();
      remaining = remaining.slice(spMatch[0].length);
    }

    if (!remaining.trim()) continue;

    const speakerChanged = lineSpeaker && lineSpeaker !== currentSpeaker;
    const tooLong = currentText.length > 600;

    if (speakerChanged || (tooLong && (lineTimestamp != null || lineSpeaker)) || (tooLong && !lineSpeaker && !lineTimestamp)) {
      if (currentText) flush();
      currentSpeaker = lineSpeaker || currentSpeaker;
      currentText = remaining;
      currentTimestamp = lineTimestamp ?? currentTimestamp;
    } else {
      if (!currentText) {
        currentSpeaker = lineSpeaker || currentSpeaker;
        currentTimestamp = lineTimestamp ?? currentTimestamp;
        currentText = remaining;
      } else {
        currentText += " " + remaining;
      }
    }
  }

  if (currentText) flush();

  if (segments.length === 0 && rawText.trim().length > 0) {
    const words = rawText.trim().split(/\s+/);
    const chunkSize = 150;
    for (let i = 0; i < words.length; i += chunkSize) {
      const chunk = words.slice(i, i + chunkSize).join(" ");
      const cleaned = cleanText(chunk);
      if (!cleaned) continue;
      segments.push({
        transcriptId: transcriptId ?? null,
        episodeGuid,
        podcastSlug,
        episodeSlug,
        sequenceIndex: segIndex,
        timestampSeconds: null,
        timestampLabel: null,
        speakerName: null,
        text: cleaned,
        anchorId: `seg-${segIndex}`,
      });
      segIndex++;
    }
  }

  return deduplicateAnchors(segments);
}
