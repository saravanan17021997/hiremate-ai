// Shared by the Projects page and its tests.
import type { Project } from "./types";

/** How many of the 6 detail fields are filled: shown as "4/6 details" on each card. */
export function projectDetailCount(p: Pick<Project, "description" | "technologies" | "responsibilities" | "challenges" | "solutions" | "businessImpact">) {
  return [p.description, p.technologies.length ? "x" : "", p.responsibilities, p.challenges, p.solutions, p.businessImpact].filter((v) => v.trim()).length;
}
