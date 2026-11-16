// Project knowledge base: always saved on this PC, and also in Supabase when signed in.
import { randomUUID } from "node:crypto";
import type { Project, ProjectInput, ProjectList } from "@shared/types";
import type { LocalStore } from "../data/localStore";
import type { AccountService } from "../cloud/account";

type Row = {
  id: string; name: string; description: string; technologies: string[]; responsibilities: string;
  challenges: string; solutions: string; business_impact: string; updated_at: string;
};

const fromRow = (r: Row): Project => ({
  id: r.id, name: r.name, description: r.description, technologies: r.technologies ?? [], responsibilities: r.responsibilities,
  challenges: r.challenges, solutions: r.solutions, businessImpact: r.business_impact, updatedAt: r.updated_at,
});

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export class ProjectService {
  constructor(private readonly store: LocalStore, private readonly account: AccountService) {}

  private async signedInClient() {
    if (!this.account.client) return null;
    const { data } = await this.account.client.auth.getSession();
    return data.session ? this.account.client : null;
  }

  async list(): Promise<ProjectList> {
    const data = this.store.read();
    const client = await this.signedInClient();
    let projects: Project[] = data.projects;
    if (client) {
      const { data: rows, error } = await client.from("projects").select("*").order("updated_at", { ascending: false });
      if (error) throw new Error(`Couldn't load your projects: ${error.message}`);
      projects = (rows as Row[]).map(fromRow);
    } else {
      projects = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    // Resume projects not added yet (matched by name).
    const suggestions = data.resumeProjects.filter((s) => !projects.some((p) => sameName(p.name, s.name)));
    return { projects, suggestions, savedTo: client ? "supabase" : "local" };
  }

  async save(input: ProjectInput): Promise<ProjectList> {
    const data = this.store.read();
    const id = input.id ?? randomUUID();
    const existing = data.projects.find((p) => p.id === id);
    if (input.id && !existing && !(await this.signedInClient())) throw new Error("That project no longer exists.");
    const duplicate = data.projects.find((p) => p.id !== id && sameName(p.name, input.name));
    if (duplicate) throw new Error(`You already have a project called "${duplicate.name}". Open it to edit, or use a different name.`);

    const project: Project = { ...input, id, updatedAt: new Date().toISOString() };
    data.projects = existing ? data.projects.map((p) => (p.id === id ? project : p)) : [project, ...data.projects];
    this.store.write(data);

    const client = await this.signedInClient();
    if (client) {
      const { error } = await client.from("projects").upsert({
        id, name: project.name, description: project.description, technologies: project.technologies,
        responsibilities: project.responsibilities, challenges: project.challenges, solutions: project.solutions,
        business_impact: project.businessImpact,
      });
      if (error) throw new Error(`Saved on this PC, but not to your account: ${error.message}`);
    }
    return this.list();
  }

  async remove(id: string): Promise<ProjectList> {
    const data = this.store.read();
    data.projects = data.projects.filter((p) => p.id !== id);
    this.store.write(data);
    const client = await this.signedInClient();
    if (client) {
      const { error } = await client.from("projects").delete().eq("id", id);
      if (error) throw new Error(`Removed on this PC, but not from your account: ${error.message}`);
    }
    return this.list();
  }
}
