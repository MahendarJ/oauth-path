"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchBox({ librarySlugs }: { librarySlugs: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function submit(value: string) {
    const q = value.trim();
    if (!q) return;
    // A name that matches a library guide opens it directly; anything else goes to the agent.
    const asSlug = q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (librarySlugs.includes(asSlug)) {
      router.push(`/guides/${asSlug}`);
      return;
    }
    router.push(`/generate?q=${encodeURIComponent(q)}`);
  }

  return (
    <form
      className="search"
      onSubmit={(e) => {
        e.preventDefault();
        submit(query);
      }}
    >
      <input
        className="search-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="App name or developer docs URL, e.g. linear or https://developers.notion.com"
        aria-label="App name or URL"
        autoFocus
      />
      <button className="btn btn-primary" type="submit" disabled={!query.trim()}>
        Get guide
      </button>
    </form>
  );
}
