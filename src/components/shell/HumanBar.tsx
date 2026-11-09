"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useMesh } from "@/store/mesh";

export function HumanBar({ onAnswer }: { onAnswer: (decision: "approve" | "reject" | "note", text: string) => void }) {
  const pending = useMesh((state) => state.pending[0]);
  const [text, setText] = useState("");
  if (!pending) return null;
  return (
    <form
      className="flex shrink-0 items-center gap-3 border-t border-lavender/30 bg-black px-4 py-2"
      data-testid="human-bar"
      onSubmit={(event) => {
        event.preventDefault();
        onAnswer(pending.mode === "approval" ? "approve" : "note", text);
        setText("");
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] tracking-[0.14em] text-lavender">{pending.prompt}</div>
        {pending.command && <div className="truncate font-mono text-[11px] text-olive">{pending.command}</div>}
      </div>
      {pending.mode === "human" && (
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Note to the agent"
          className="h-8 w-72 border border-white/10 bg-black px-2 text-sm outline-none focus:border-lavender"
        />
      )}
      {pending.mode === "approval" ? (
        <>
          <Button type="submit" variant="olive">
            Approve
          </Button>
          <Button type="button" variant="outline" onClick={() => onAnswer("reject", text)}>
            Reject
          </Button>
        </>
      ) : (
        <Button type="submit">Send</Button>
      )}
    </form>
  );
}
