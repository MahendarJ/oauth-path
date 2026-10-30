import { generateGuide, type PipelineEvent } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Streams pipeline progress as server-sent events. The final guide is saved by the pipeline; only its slug is sent. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) return new Response("Missing q", { status: 400 });

  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: PipelineEvent) => {
        if (closed) return;
        const payload = event.type === "done" ? { type: "done", slug: event.slug } : event;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ ...payload, at: Date.now() })}\n\n`));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      generateGuide(q, { onEvent: send })
        .then(close)
        .catch((err: unknown) => {
          send({ type: "error", message: err instanceof Error ? err.message : String(err) });
          close();
        });
    },
    cancel() {
      // Client went away; the run finishes and caches its guide, but nothing more is sent.
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
