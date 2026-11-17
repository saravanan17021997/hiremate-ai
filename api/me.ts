// GET /api/me — is this signed-in account invited, and which AI does the server use?
import { MODEL, env, requireUser, route, sendJson } from "./_lib/server";

export default route(["GET"], async (req, res) => {
  const { user } = await requireUser(req); // 401 / 403 with a clear message if not
  sendJson(res, 200, { email: user.email, model: MODEL(), aiReady: Boolean(env("GROQ_API_KEY")) });
});
