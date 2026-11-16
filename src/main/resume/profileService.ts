// Reads and saves the candidate profile: always on this PC, and also in Supabase when signed in.
import type { CandidateProfile, SavedProfile } from "@shared/types";
import type { LocalStore, StoreData } from "../data/localStore";
import type { AccountService } from "../cloud/account";
import { profileFromRow } from "../data/remoteSummary";
import type { ResumeFile } from "../documents/extract";

export class ProfileService {
  constructor(private readonly store: LocalStore, private readonly account: AccountService) {}

  private async userId(): Promise<string | null> {
    if (!this.account.client) return null;
    const { data } = await this.account.client.auth.getSession();
    return data.session?.user.id ?? null;
  }

  async get(): Promise<SavedProfile> {
    const local = this.store.read();
    const uid = await this.userId();
    if (uid && this.account.client) {
      const { data, error } = await this.account.client.from("profiles").select("*").eq("user_id", uid).maybeSingle();
      if (error) throw new Error(`Couldn't load your profile: ${error.message}`);
      return { profile: profileFromRow(data) ?? local.profile, resumeFileName: local.resumeFileName, resumeParsedAt: local.resumeParsedAt, savedTo: "supabase" };
    }
    return { profile: local.profile, resumeFileName: local.resumeFileName, resumeParsedAt: local.resumeParsedAt, savedTo: "local" };
  }

  async save(profile: CandidateProfile, resume?: ResumeFile & { extraction: unknown }): Promise<SavedProfile> {
    // 1. Always keep a copy on this PC.
    const data = this.store.read();
    data.profile = profile;
    if (resume) {
      data.resumeParsedAt = new Date().toISOString();
      data.resumeFileName = resume.fileName;
      const found = (resume.extraction as { projects?: StoreData["resumeProjects"] })?.projects;
      if (Array.isArray(found)) data.resumeProjects = found; // offered on the Projects page
    }
    this.store.write(data);

    // 2. Signed in: save to Supabase too (RLS makes sure it can only be this user's row).
    const uid = await this.userId();
    if (uid && this.account.client) {
      const row = {
        user_id: uid,
        full_name: profile.fullName,
        professional_summary: profile.professionalSummary,
        total_experience_years: profile.totalExperienceYears,
        current_designation: profile.currentDesignation,
        technical_skills: profile.technicalSkills,
        education: profile.education,
        employment: profile.employment,
        achievements: profile.achievements,
      };
      const { error } = await this.account.client.from("profiles").upsert(row, { onConflict: "user_id" });
      if (error) throw new Error(`Saved on this PC, but not to your account: ${error.message}`);
      if (resume) {
        const { error: rErr } = await this.account.client.from("resumes").insert({
          file_name: resume.fileName,
          file_type: resume.fileType,
          file_size: resume.fileSize,
          extracted_text: resume.text,
          extraction: resume.extraction,
          parsed_at: data.resumeParsedAt,
        });
        if (rErr) throw new Error(`Profile saved, but the resume record wasn't: ${rErr.message}`);
      }
    }
    return this.get();
  }
}
