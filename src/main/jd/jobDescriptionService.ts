// Job description: kept on this PC, and in Supabase when signed in. Used only as context for answers.
import type { JobDescription } from "@shared/types";
import type { LocalStore } from "../data/localStore";
import type { AccountService } from "../cloud/account";

export const MAX_JD_CHARS = 12_000;

export class JobDescriptionService {
  constructor(private readonly store: LocalStore, private readonly account: AccountService) {}

  private async signedInClient() {
    if (!this.account.client) return null;
    const { data } = await this.account.client.auth.getSession();
    return data.session ? this.account.client : null;
  }

  get(): JobDescription | null {
    return this.store.read().jobDescription;
  }

  async save(fileName: string, text: string): Promise<JobDescription> {
    const jd: JobDescription = { fileName, text: text.slice(0, MAX_JD_CHARS), uploadedAt: new Date().toISOString() };
    const data = this.store.read();
    data.jobDescription = jd;
    this.store.write(data);
    const client = await this.signedInClient();
    if (client) {
      await client.from("job_descriptions").delete().neq("id", "00000000-0000-0000-0000-000000000000"); // keep one per user (RLS limits this to the user's own rows)
      const { error } = await client.from("job_descriptions").insert({ file_name: fileName, text: jd.text });
      if (error) throw new Error(`Saved on this PC, but not to your account: ${error.message}`);
    }
    return jd;
  }

  async clear() {
    const data = this.store.read();
    data.jobDescription = null;
    this.store.write(data);
    const client = await this.signedInClient();
    if (client) await client.from("job_descriptions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  }
}
