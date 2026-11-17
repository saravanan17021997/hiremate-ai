// App layout: collapsible sidebar + routed pages over the gradient backdrop.
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { PlannedModule } from "./pages/PlannedModule";
import { Settings } from "./pages/Settings";
import { MyResume } from "./pages/MyResume";
import { Projects } from "./pages/Projects";
import { AIInterview } from "./pages/AIInterview";
import { LiveAssistant } from "./pages/LiveAssistant";
import { History } from "./pages/History";
import { FloatingPanel } from "./pages/FloatingPanel";
import { PhoneScreen } from "./pages/PhoneScreen";
import { MobileNav, MobileTitle } from "./components/MobileNav";
import { NAV } from "./lib/nav";

const SIDEBAR_KEY = "hiremate.sidebarCollapsed";

function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}

export default function App() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const location = useLocation();

  // The floating panel window shows only the panel: no sidebar.
  if (location.pathname === "/panel") return <FloatingPanel />;
  // The phone screen is a page of its own: just the question and the reply.
  if (location.pathname === "/phone") return <PhoneScreen />;

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, c ? "0" : "1");
      } catch {
        /* storage unavailable: just don't remember */
      }
      return !c;
    });
  };

  return (
    <div className="app-backdrop flex h-full overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <main className="min-w-0 flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6 md:px-8 lg:px-10">
          <MobileTitle />
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Routes location={location}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/resume" element={<MyResume />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/ai-interview" element={<AIInterview />} />
                <Route path="/live" element={<LiveAssistant />} />
                <Route path="/history" element={<History />} />
                {NAV.filter((n) => !["/", "/settings", "/resume", "/projects", "/ai-interview", "/live", "/history", "/phone"].includes(n.path)).map((item) => (
                  <Route key={item.path} path={item.path} element={<PlannedModule item={item} />} />
                ))}
                <Route path="*" element={<Dashboard />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
