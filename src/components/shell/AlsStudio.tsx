"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { alsEmbedSrc } from "@/lib/alsEmbed";
import { useMesh } from "@/store/mesh";

export function AlsStudio() {
  const alsApiUrl = useMesh((state) => state.settings.alsApiUrl);
  const { src, proxied } = alsEmbedSrc(alsApiUrl);
  const shellRef = useRef<HTMLDivElement>(null);
  const [frameSrc, setFrameSrc] = useState<string | null>(null);

  useEffect(() => {
    const mount = window.setTimeout(() => setFrameSrc(src), 50);
    return () => {
      window.clearTimeout(mount);
      setFrameSrc(null);
    };
  }, [src]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || !frameSrc) return;
    const iframe = shell.querySelector("iframe");
    if (!iframe) return;

    const syncSize = () => {
      const rect = shell.getBoundingClientRect();
      const w = Math.max(0, Math.floor(rect.width));
      const h = Math.max(0, Math.floor(rect.height));
      iframe.style.width = `${w}px`;
      iframe.style.height = `${h}px`;
    };

    syncSize();
    const observer = new ResizeObserver(() => syncSize());
    observer.observe(shell);
    window.addEventListener("resize", syncSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncSize);
    };
  }, [frameSrc]);

  const openTab = () => {
    const direct = (alsApiUrl || "http://127.0.0.1:8080").replace(/\/$/, "");
    window.open(direct, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-black" data-testid="als-studio">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-lavender/25 px-3 py-1.5">
        <p className="truncate font-mono text-[10px] tracking-[0.12em] text-lavender-bright">
          ALS {proxied ? "· embedded" : "· direct"} · {src}
        </p>
        <Button variant="ghost" size="sm" className="h-7 gap-1 font-mono text-[10px]" onClick={openTab} type="button">
          <ExternalLink size={12} />
          TAB
        </Button>
      </div>
      <div ref={shellRef} className="tim-als-shell relative min-h-0 flex-1 overflow-hidden bg-black">
        {frameSrc ? (
          <iframe
            title="Autonomous Loop Studio"
            src={frameSrc}
            className="tim-als-frame block border-0 bg-black"
            allow="clipboard-read; clipboard-write; fullscreen"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-[10px] text-zinc-500">Loading Loop Studio…</div>
        )}
      </div>
    </div>
  );
}
