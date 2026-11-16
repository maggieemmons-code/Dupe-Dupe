"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { showStore } from "./actions";
import ui from "../ui.module.css";

/** "Show again" on the Hidden stores page. */
export default function ShowAgain({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={ui.btnSmall}
      disabled={pending}
      aria-label={`Show ${name} again`}
      onClick={() =>
        start(async () => {
          await showStore({ id });
          router.refresh();
        })
      }
    >
      Show again
    </button>
  );
}
