import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalStore } from "../data/localStore";
import { AccountService } from "../cloud/account";
import { SecretStore } from "../secrets/secretStore";
import { ProjectService } from "./projectService";
import { projectDetailCount } from "@shared/projects";

const make = () => {
  const dir = mkdtempSync(join(tmpdir(), "hm-proj-"));
  const store = LocalStore.inFolder(dir);
  const secrets = SecretStore.inFolder(dir, { isAvailable: () => true, encrypt: (p) => Buffer.from(p), decrypt: (d) => d.toString() });
  return { store, svc: new ProjectService(store, new AccountService(null, secrets)) };
};
const blank = { description: "", technologies: [], responsibilities: "", challenges: "", solutions: "", businessImpact: "" };

describe("ProjectService (on this PC)", () => {
  it("creates, updates and deletes a project", async () => {
    const { svc } = make();
    let list = await svc.save({ ...blank, name: "SaraDev POS", technologies: ["Kotlin"] });
    expect(list.projects).toHaveLength(1);
    const id = list.projects[0].id;
    list = await svc.save({ ...blank, id, name: "SaraDev POS", businessImpact: "Billing in under 30 seconds" });
    expect(list.projects[0]).toMatchObject({ id, businessImpact: "Billing in under 30 seconds" });
    list = await svc.remove(id);
    expect(list.projects).toEqual([]);
  });

  it("refuses a duplicate name", async () => {
    const { svc } = make();
    await svc.save({ ...blank, name: "DRISHTI" });
    await expect(svc.save({ ...blank, name: " drishti " })).rejects.toThrow(/already have/);
  });

  it("offers resume projects that aren't added yet", async () => {
    const { svc, store } = make();
    const data = store.read();
    data.resumeProjects = [{ name: "SaraDev POS", description: "", technologies: [] }, { name: "VARUNA", description: "SIH", technologies: [] }];
    store.write(data);
    expect((await svc.list()).suggestions.map((s) => s.name)).toEqual(["SaraDev POS", "VARUNA"]);
    await svc.save({ ...blank, name: "saradev pos" });
    expect((await svc.list()).suggestions.map((s) => s.name)).toEqual(["VARUNA"]);
  });

  it("counts filled details", () => {
    expect(projectDetailCount({ ...blank })).toBe(0);
    expect(projectDetailCount({ ...blank, description: "x", technologies: ["a"], businessImpact: "y" })).toBe(3);
  });
});
