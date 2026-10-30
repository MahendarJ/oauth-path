import { oauthMetadata } from "./oauth-metadata";
import { protectedResource } from "./protected-resource";
import { authorizeEndpoint } from "./authorize-endpoint";
import { dcrAdvertised } from "./dcr-advertised";
import { composioTrack, normalizeSlug } from "./composio-track";
import { ProbeObservation } from "./types";
import { validateSafeUrl } from "./ssrf";

export * from "./types";
export * from "./ssrf";
export * from "./oauth-metadata";
export * from "./protected-resource";
export * from "./authorize-endpoint";
export * from "./dcr-advertised";
export * from "./composio-track";

export async function runAllProbes(
  origin: string,
  explicitSlug?: string
): Promise<ProbeObservation[]> {
  const observations: ProbeObservation[] = [];

  // 1. SSRF check for origin
  await validateSafeUrl(origin);
  const cleanOrigin = origin.replace(/\/+$/, "");

  // 2. OAuth Metadata discovery
  const metadataObs = await oauthMetadata(cleanOrigin);
  observations.push(metadataObs);

  // 3. Protected Resource discovery (RFC 9728)
  const protectedObs = await protectedResource(cleanOrigin);
  observations.push(protectedObs);

  // 4. Authorize Endpoint probe
  let authEndpointUrl: string | null = null;
  const metadata = metadataObs.facts.metadata as Record<string, unknown> | null;
  if (metadata && typeof metadata.authorization_endpoint === "string") {
    authEndpointUrl = metadata.authorization_endpoint;
  } else {
    // Fallback standard authorize path on origin
    authEndpointUrl = `${cleanOrigin}/authorize`;
  }

  if (authEndpointUrl) {
    const authObs = await authorizeEndpoint(authEndpointUrl);
    observations.push(authObs);
  }

  // 5. DCR advertised probe
  const dcrObs = dcrAdvertised(metadata, cleanOrigin);
  observations.push(dcrObs);

  // 6. Composio track lookup
  const slug = explicitSlug || normalizeSlug(origin);
  const composioObs = await composioTrack(slug);
  observations.push(composioObs);

  return observations;
}
