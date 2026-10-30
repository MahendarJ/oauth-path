import { ProbeObservation } from "./types";

export function dcrAdvertised(
  metadata: Record<string, unknown> | null,
  referenceUrl: string
): ProbeObservation {
  const checkedAt = new Date().toISOString();

  if (!metadata) {
    return {
      probe: "dcrAdvertised",
      url: referenceUrl,
      checkedAt,
      status: "unknown",
      facts: {
        dcrAdvertised: "unknown",
        registrationEndpoint: null,
        note: "No OAuth metadata was discovered; Dynamic Client Registration advertisement status is unknown.",
      },
      evidence: "tested",
    };
  }

  const registrationEndpoint =
    typeof metadata.registration_endpoint === "string" &&
    metadata.registration_endpoint.trim().length > 0
      ? metadata.registration_endpoint
      : null;

  const advertised = Boolean(registrationEndpoint);

  const facts: Record<string, unknown> = {
    dcrAdvertised: advertised,
    registrationEndpoint,
    note: advertised
      ? "Dynamic Client Registration endpoint is advertised in metadata. Not called per safety rules."
      : "Dynamic Client Registration endpoint is not advertised.",
  };

  return {
    probe: "dcrAdvertised",
    url: registrationEndpoint || referenceUrl,
    checkedAt,
    status: "ok",
    facts,
    evidence: "tested",
  };
}
