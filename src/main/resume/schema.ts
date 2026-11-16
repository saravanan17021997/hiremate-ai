// Validation for profiles: used for AI output (lenient: fills gaps) and for saving (strict limits).
import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
const list = (max: number, itemMax: number) => z.array(text(itemMax)).max(max).transform((a) => a.filter(Boolean));

export const profileSchema = z.object({
  fullName: text(120),
  professionalSummary: text(4000),
  totalExperienceYears: z.number().min(0).max(60).nullable(),
  currentDesignation: text(120),
  technicalSkills: list(100, 60),
  education: z.array(z.object({ degree: text(200), institution: text(200), years: text(40) })).max(20),
  employment: z.array(z.object({ role: text(200), company: text(200), years: text(40) })).max(30),
  achievements: list(50, 500),
});

// The AI may leave things out or use slightly different types: coerce, then apply the same limits.
const loose = <T extends z.ZodTypeAny>(schema: T, fallback: z.input<T>) => schema.catch(fallback as never);
const str = (max: number) => loose(z.coerce.string().transform((s) => (s === "null" || s === "undefined" ? "" : s.trim().slice(0, max))), "");
const strList = (max: number, itemMax: number) =>
  loose(z.array(z.coerce.string()).transform((a) => a.map((s) => s.trim().slice(0, itemMax)).filter(Boolean).slice(0, max)), []);

export const aiExtractionSchema = z.object({
  profile: z.object({
    fullName: str(120),
    professionalSummary: str(4000),
    totalExperienceYears: loose(z.coerce.number().min(0).max(60).nullable(), null),
    currentDesignation: str(120),
    technicalSkills: strList(100, 60),
    education: loose(z.array(z.object({ degree: str(200), institution: str(200), years: str(40) })).transform((a) => a.slice(0, 20)), []),
    employment: loose(z.array(z.object({ role: str(200), company: str(200), years: str(40) })).transform((a) => a.slice(0, 30)), []),
    achievements: strList(50, 500),
  }),
  projects: loose(
    z.array(z.object({ name: str(200), description: str(2000), technologies: strList(30, 60) })).transform((a) => a.filter((p) => p.name).slice(0, 30)),
    [],
  ),
});
