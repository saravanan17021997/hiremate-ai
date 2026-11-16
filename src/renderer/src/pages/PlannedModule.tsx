// Shown for modules not built yet. It says plainly what the module will do and in which phase.
import { motion } from "framer-motion";
import { CircleDashed } from "lucide-react";
import type { NavItem } from "../lib/nav";
import { PageHeader } from "../components/PageHeader";

export function PlannedModule({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <>
      <PageHeader title={item.label} subtitle={item.summary} />
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="glass max-w-3xl rounded-3xl p-8"
      >
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.05] text-electric-soft">
            <Icon className="h-6 w-6" strokeWidth={1.7} />
          </span>
          <div>
            <p className="text-lg font-semibold text-mist">Not built yet</p>
            <p className="text-sm text-haze">Planned for Phase {item.phase}. Nothing on this page works until then.</p>
          </div>
        </div>
        <ul className="mt-6 space-y-3">
          {item.plan.map((line) => (
            <li key={line} className="flex gap-3 text-[15px] text-haze">
              <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-dim" />
              {line}
            </li>
          ))}
        </ul>
      </motion.section>
    </>
  );
}
