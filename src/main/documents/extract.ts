// Resume files: checks that a file really is a PDF or Word document, then pulls out its text.
// Runs only in the main process. The UI never gets file paths or raw bytes.

import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import mammoth from "mammoth";
import { extractText as extractPdfText, getDocumentProxy } from "unpdf";

export type DocType = "pdf" | "docx";
export const MAX_BYTES = 10 * 1024 * 1024; // 10 MB, same limit as the database
export const MAX_TEXT_CHARS = 60_000; // more than any real resume; protects the AI request size

export class DocumentError extends Error {}

/** Decides the type from BOTH the extension and the file's first bytes, so a renamed file is caught. */
export function detectType(fileName: string, bytes: Buffer): DocType {
  const ext = extname(fileName).toLowerCase();
  if (ext !== ".pdf" && ext !== ".docx") throw new DocumentError("Please choose a PDF or a Word (.docx) file. Older .doc files: save them as .docx first.");
  if (bytes.length === 0) throw new DocumentError("This file is empty.");
  if (ext === ".pdf") {
    if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new DocumentError("This file is named .pdf but isn't a real PDF.");
    return "pdf";
  }
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (!isZip || !bytes.includes("word/document.xml")) throw new DocumentError("This file is named .docx but isn't a real Word document.");
  return "docx";
}

/** Tidies extracted text: no repeated blank lines or trailing spaces. */
export function normaliseText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractText(bytes: Buffer, type: DocType): Promise<string> {
  let raw: string;
  try {
    if (type === "pdf") {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      raw = (await extractPdfText(pdf, { mergePages: true })).text as string;
    } else {
      raw = (await mammoth.extractRawText({ buffer: bytes })).value;
    }
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (/password/i.test(msg)) throw new DocumentError("This PDF is password-protected. Remove the password and try again.");
    throw new DocumentError("This file couldn't be read. It may be damaged; try exporting it again.");
  }
  const text = normaliseText(raw);
  if (text.length < 80) {
    throw new DocumentError(
      type === "pdf"
        ? "Almost no text was found. This looks like a scanned PDF (an image of text). Use a PDF exported from Word or Google Docs."
        : "Almost no text was found in this document.",
    );
  }
  return text.slice(0, MAX_TEXT_CHARS);
}

export interface ResumeFile {
  fileName: string;
  fileType: DocType;
  fileSize: number;
  text: string;
}

/** Same checks as readResumeFile, for a file uploaded to the web version. */
export async function readResumeBytes(fileName: string, bytes: Buffer): Promise<ResumeFile> {
  if (bytes.length === 0) throw new DocumentError("That file is empty.");
  if (bytes.length > MAX_BYTES) throw new DocumentError(`This file is ${(bytes.length / 1048576).toFixed(1)} MB. The limit is 10 MB.`);
  const name = basename(fileName || "document");
  const fileType = detectType(name, bytes);
  return { fileName: name, fileType, fileSize: bytes.length, text: await extractText(bytes, fileType) };
}

export async function readResumeFile(path: string): Promise<ResumeFile> {
  const info = await stat(path);
  if (!info.isFile()) throw new DocumentError("That isn't a file.");
  if (info.size > MAX_BYTES) throw new DocumentError(`This file is ${(info.size / 1048576).toFixed(1)} MB. The limit is 10 MB.`);
  const fileName = basename(path);
  const bytes = await readFile(path);
  const fileType = detectType(fileName, bytes);
  return { fileName, fileType, fileSize: info.size, text: await extractText(bytes, fileType) };
}
