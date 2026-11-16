"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { blockForEveryone, unblockForEveryone } from "./actions";
import ui from "../ui.module.css";

/** Maggie's Block for everyone / Unblock buttons on Hidden stores. */
export default function StoreButton(props: { block: { name: string; domain: string; friends: number } } | { unblock: { id: string; name: string } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const isBlock = "block" in props;
  return (
    <span>
      <button
        type="button"
        className={ui.btnSmall}
        disabled={pending}
        aria-label={isBlock ? `Block ${props.block.name} for everyone` : `Unblock ${props.unblock.name}`}
        onClick={() =>
          start(async () => {
            const r = isBlock ? await blockForEveryone(props.block) : await unblockForEveryone(props.unblock.id);
            if (!r.ok) return setError(r.error);
            router.refresh();
          })
        }
      >
        {isBlock ? "Block for everyone" : "Unblock"}
      </button>
      {error && <span role="alert"> {error}</span>}
    </span>
  );
}
