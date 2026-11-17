// Opens the browser's file picker. Must be called straight from a click (browsers require it).
// Resolves null when the person cancels.
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    let done = false;
    const finish = (f: File | null) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(f);
    };
    input.addEventListener("change", () => finish(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => finish(null));
    // Older browsers have no "cancel" event: treat returning to the page without a file as cancel.
    window.addEventListener("focus", () => setTimeout(() => finish(input.files?.[0] ?? null), 800), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}
