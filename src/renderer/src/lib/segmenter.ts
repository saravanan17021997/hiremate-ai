// Splits continuous audio into speech segments using loudness (RMS) readings taken every ~100 ms.
// A segment starts when it gets loud enough and ends after a short pause, or at a maximum length.

export interface SegmenterOptions {
  threshold: number; // RMS level that counts as speech (0..1)
  silenceMs: number; // pause that ends a segment
  minSpeechMs: number; // shorter bursts (a cough, a click) are ignored
  maxSegmentMs: number; // long monologues are cut so text keeps flowing
}

// silenceMs: how long a pause ends a sentence. Shorter answers sooner but may cut a question in half.
export const DEFAULT_SEGMENTER: SegmenterOptions = { threshold: 0.015, silenceMs: 500, minSpeechMs: 350, maxSegmentMs: 12000 };

/** The "Pause before answering" choices in the Live Assistant. */
export const PAUSE_CHOICES = [
  { id: "fast", label: "Fast", ms: 500, hint: "0.5 s pause: answers soonest" },
  { id: "normal", label: "Normal", ms: 700, hint: "0.7 s pause: balanced" },
  { id: "careful", label: "Careful", ms: 1000, hint: "1 s pause: rarely cuts a question" },
] as const;
export type PauseChoice = (typeof PAUSE_CHOICES)[number]["id"];

export type SegmentEvent = { type: "speech-start" } | { type: "segment-end"; hadSpeech: boolean; speechMs: number };

export class SpeechSegmenter {
  private speaking = false;
  private segmentStart = 0;
  private lastLoud = 0;
  private speechMs = 0;
  private lastAt = 0;

  private readonly opts: SegmenterOptions;

  constructor(opts: Partial<SegmenterOptions> = {}) {
    this.opts = { ...DEFAULT_SEGMENTER, ...opts };
  }

  /** Change the pause length while listening (takes effect at once). */
  setSilenceMs(ms: number) {
    this.opts.silenceMs = ms;
  }

  /** Feed one loudness reading; returns an event when a segment starts or ends. */
  feed(rms: number, now: number): SegmentEvent | null {
    const step = this.lastAt ? now - this.lastAt : 0;
    this.lastAt = now;
    const loud = rms >= this.opts.threshold;
    if (!this.speaking) {
      if (!loud) return null;
      this.speaking = true;
      this.segmentStart = now;
      this.lastLoud = now;
      this.speechMs = 0;
      return { type: "speech-start" };
    }
    if (loud) {
      this.lastLoud = now;
      this.speechMs += step;
    }
    const pause = now - this.lastLoud >= this.opts.silenceMs;
    const tooLong = now - this.segmentStart >= this.opts.maxSegmentMs;
    if (pause || tooLong) {
      this.speaking = false;
      return { type: "segment-end", hadSpeech: this.speechMs >= this.opts.minSpeechMs, speechMs: this.speechMs };
    }
    return null;
  }
}
