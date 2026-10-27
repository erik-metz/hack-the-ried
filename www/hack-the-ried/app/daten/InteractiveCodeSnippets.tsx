"use client";

import { Check, Copy, Terminal } from "lucide-react";
import { useState } from "react";

interface InteractiveCodeSnippetsProps {
  codeSnippets: {
    curl: string;
    python: string;
    javascript: string;
  };
}

export default function InteractiveCodeSnippets({
  codeSnippets,
}: InteractiveCodeSnippetsProps) {
  const [activeCodeTab, setActiveCodeTab] = useState<
    "curl" | "python" | "javascript"
  >("curl");
  const [copiedTab, setCopiedTab] = useState<string | null>(null);

  const copyToClipboard = (text: string, tabKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTab(tabKey);
    setTimeout(() => setCopiedTab(null), 2000);
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Terminal className="w-5 h-5 text-emerald-400" /> Schnelleinstieg in
            Code
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Wähle deine bevorzugte Technologie, um sofort Messdaten abzufragen.
          </p>
        </div>

        {/* Language Selector */}
        <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
          <button
            onClick={() => setActiveCodeTab("curl")}
            className={`px-3.5 py-1.5 rounded-lg transition-colors font-semibold ${
              activeCodeTab === "curl"
                ? "bg-slate-800 text-emerald-400"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            cURL
          </button>
          <button
            onClick={() => setActiveCodeTab("python")}
            className={`px-3.5 py-1.5 rounded-lg transition-colors font-semibold ${
              activeCodeTab === "python"
                ? "bg-slate-800 text-emerald-400"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Python
          </button>
          <button
            onClick={() => setActiveCodeTab("javascript")}
            className={`px-3.5 py-1.5 rounded-lg transition-colors font-semibold ${
              activeCodeTab === "javascript"
                ? "bg-slate-800 text-emerald-400"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            JavaScript
          </button>
        </div>
      </div>

      {/* Code Box */}
      <div className="relative group">
        <pre className="p-5 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-xs sm:text-sm text-slate-300 overflow-x-auto leading-relaxed">
          <code>{codeSnippets[activeCodeTab]}</code>
        </pre>
        <button
          onClick={() =>
            copyToClipboard(codeSnippets[activeCodeTab], activeCodeTab)
          }
          className="absolute top-3 right-3 px-3 py-1.5 rounded-xl bg-slate-800/90 border border-slate-700 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-700 transition-all flex items-center gap-1.5 shadow-lg"
        >
          {copiedTab === activeCodeTab ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Kopiert!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-slate-400" />
              <span>Kopieren</span>
            </>
          )}
        </button>
      </div>
    </>
  );
}
