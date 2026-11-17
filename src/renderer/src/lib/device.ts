// What this device can do. Phones and tablets can't share another app's or tab's sound with a web page,
// so on them the Live Assistant listens through a microphone (the phone's own, or a Bluetooth headset's).
const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

export const IS_MOBILE =
  /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua) ||
  // iPadOS reports itself as a Mac with a touch screen.
  (/Macintosh/.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);

/** Can this browser share a meeting tab's (or the screen's) sound? Desktop Chrome/Edge: yes. Phones: no. */
export const CAN_SHARE_TAB_AUDIO = !IS_MOBILE && typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";

export type InputKind = "bluetooth" | "headset" | "builtin" | "other";

/** A best guess from the name the browser gives the input (names appear once the microphone is allowed). */
export function inputKind(label: string): InputKind {
  if (/bluetooth|\bbt\b|airpods|buds|hands[- ]?free|\bsco\b/i.test(label)) return "bluetooth";
  if (/headset|headphone|earphone|earpiece|wired/i.test(label)) return "headset";
  if (/built[- ]?in|internal|speakerphone|phone microphone|default|bottom|front|back|iphone microphone/i.test(label)) return "builtin";
  return "other";
}

export const KIND_LABEL: Record<InputKind, string> = {
  bluetooth: "Bluetooth headset",
  headset: "Headset",
  builtin: "Phone microphone",
  other: "Microphone",
};
