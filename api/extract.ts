// POST /api/extract?purpose=resume|jd — reads an uploaded PDF or Word file.
// resume: also asks the AI for a draft profile (you review it before anything is saved).
import { DocumentError, readResumeBytes } from "../src/main/documents/extract";
import { structureResume } from "../src/main/resume/structure";
import { HttpError, MODEL, groq, groqKey, query, readBody, requireUser, route, sendJson } from "./_lib/server";


export default route(["POST"], async (req, res) => {
  await requireUser(req);
  const purpose = query(req, "purpose");
  if (purpose !== "resume" && purpose !== "jd") throw new HttpError(400, "Unknown upload.");
  const fileName = decodeURIComponent(String(req.headers["x-file-name"] ?? "document"));
  const bytes = await readBody(req, 4 * 1024 * 1024);
  let file;
  try {
    file = await readResumeBytes(fileName, bytes);
  } catch (e) {
    if (e instanceof DocumentError) throw new HttpError(400, e.message);
    throw e;
  }
  if (purpose === "jd") return sendJson(res, 200, { fileName: file.fileName, text: file.text });
  const key = groqKey();
  const extraction = await structureResume((o) => groq().streamChat({ ...o, apiKey: key, model: MODEL() }), file.text);
  sendJson(res, 200, { ...file, textLength: file.text.length, profile: extraction.profile, projects: extraction.projects, model: MODEL() });
});
