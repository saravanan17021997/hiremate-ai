// Sidebar sections, in the order from the product brief. `phase` = when the module gets built.
import { FileText, FolderKanban, History, LayoutDashboard, MessagesSquare, Radio, Settings, Sparkles, type LucideIcon } from "lucide-react";

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  phase: number;
  summary: string;
  plan: string[];
}

export const NAV: NavItem[] = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard, phase: 1, summary: "", plan: [] },
  {
    path: "/ai-interview", label: "AI Interview", icon: Sparkles, phase: 5,
    summary: "Ask an interview question and get an answer suggestion built from your resume and projects.",
    plan: ["Type a question or use live transcription (with your consent)", "Short and detailed answer modes, streamed as they are written", "Technical explanations and real-world examples from your own projects", "Follow-up questions to expect, and copy-to-clipboard"],
  },
  { path: "/live", label: "Live Assistant", icon: Radio, phase: 6, summary: "", plan: [] },
  {
    path: "/mock-interview", label: "Mock Interview", icon: MessagesSquare, phase: 7,
    summary: "Practise a full interview: the AI asks, you answer, and you get feedback.",
    plan: ["Choose the job role, experience level and Technical or HR round", "Questions one at a time; answer by typing or speaking", "A score and specific improvement tips for every answer", "Session summary saved to Interview History"],
  },
  {
    path: "/resume", label: "My Resume", icon: FileText, phase: 3,
    summary: "Upload your resume once; HireMate turns it into structured, editable information.",
    plan: ["Upload PDF or DOCX (checked for type and size)", "Extract skills, experience, education and projects", "Review and edit everything before it is saved", "Your profile becomes the context for every AI answer"],
  },
  {
    path: "/projects", label: "Projects", icon: FolderKanban, phase: 4,
    summary: "Your project knowledge base, so answers about your work are specific and true.",
    plan: ["Name, description and technologies", "Your responsibilities, the challenges and how you solved them", "Business impact in your own numbers", "Used by the AI when a question is about your projects"],
  },
  {
    path: "/history", label: "Interview History", icon: History, phase: 8,
    summary: "", plan: [],
  },
  {
    path: "/settings", label: "Settings", icon: Settings, phase: 2,
    summary: "AI provider, account, privacy and microphone permissions.",
    plan: [],
  },
];
