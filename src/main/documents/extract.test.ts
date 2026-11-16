import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DocumentError, detectType, normaliseText, readResumeFile } from "./extract";

const fixture = (name: string) => join(__dirname, "fixtures", name);

describe("detectType", () => {
  it("accepts real PDF and DOCX files", () => {
    expect(detectType("cv.pdf", Buffer.from("%PDF-1.7 ..."))).toBe("pdf");
    expect(detectType("cv.DOCX", Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("....word/document.xml")]))).toBe("docx");
  });
  it("rejects other extensions, empty files and renamed files", () => {
    expect(() => detectType("cv.doc", Buffer.from("x"))).toThrow(/PDF or a Word/);
    expect(() => detectType("cv.exe", Buffer.from("MZ"))).toThrow(DocumentError);
    expect(() => detectType("cv.pdf", Buffer.alloc(0))).toThrow(/empty/);
    expect(() => detectType("cv.pdf", Buffer.from("MZ\x90\x00"))).toThrow(/isn't a real PDF/);
    expect(() => detectType("cv.docx", Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2]))).toThrow(/isn't a real Word/);
  });
});

describe("readResumeFile", () => {
  it("extracts text from a Word resume", async () => {
    const r = await readResumeFile(fixture("sample-resume.docx"));
    expect(r.fileType).toBe("docx");
    expect(r.text).toContain("Priya Raman");
    expect(r.text).toContain("reconciliation service");
  });
  it("extracts text from a PDF resume", async () => {
    const r = await readResumeFile(fixture("sample-resume.pdf"));
    expect(r.fileType).toBe("pdf");
    expect(r.text).toContain("Priya Raman");
    expect(r.text).toContain("Anna University");
  });
  it("refuses a fake PDF", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hm-doc-"));
    writeFileSync(join(dir, "cv.pdf"), "just text pretending");
    await expect(readResumeFile(join(dir, "cv.pdf"))).rejects.toThrow(/isn't a real PDF/);
  });
  it("refuses files over 10 MB", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hm-doc-"));
    writeFileSync(join(dir, "big.pdf"), Buffer.alloc(11 * 1024 * 1024));
    await expect(readResumeFile(join(dir, "big.pdf"))).rejects.toThrow(/limit is 10 MB/);
  });
  it("explains a document with almost no text", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hm-doc-"));
    copyFileSync(fixture("sample-resume.docx"), join(dir, "ok.docx"));
    const tiny = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF")]);
    writeFileSync(join(dir, "tiny.pdf"), tiny);
    await expect(readResumeFile(join(dir, "tiny.pdf"))).rejects.toThrow(DocumentError);
  });
});

describe("normaliseText", () => {
  it("collapses spaces and blank lines", () => expect(normaliseText("A  \t B\r\n\r\n\r\n\nC ")).toBe("A B\n\nC"));
});
