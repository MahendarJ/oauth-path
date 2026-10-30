import { oauthMetadata } from "./oauth-metadata";
import { protectedResource } from "./protected-resource";
import { authorizeEndpoint } from "./authorize-endpoint";
import { dcrAdvertised } from "./dcr-advertised";
import { composioTrack, normalizeSlug } from "./composio-track";
import { composioDocs } from "./composio-docs";
import { ProbeObservation } from "./types";
import { validateSafeUrl } from "./ssrf";
import { registrableDomain } from "../pipeline/resolve";

export * from "./types";
export * from "./ssrf";
export * from "./oauth-metadata";
export * from "./protected-resource";
export * from "./authorize-endpoint";
export * from "./dcr-advertised";
export * from "./composio-track";
export * from "./composio-docs";

export async function runAllProbes(
  origin: string,
  explicitSlug?: string,
  resolvedAuthEndpoint?: string
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

  // 4. Authorize Endpoint probe (run only with an endpoint from metadata or resolved.authorizationEndpoint)
  const metadata = metadataObs.facts.metadata as Record<string, unknown> | null;
  const authEndpointUrl =
    (metadata && typeof metadata.authorization_endpoint === "string"
      ? metadata.authorization_endpoint
      : undefined) || resolvedAuthEndpoint;

  if (authEndpointUrl) {
    const authObs = await authorizeEndpoint(authEndpointUrl);
    observations.push(authObs);
  }

  // 5. DCR advertised probe
  const dcrObs = dcrAdvertised(metadata, cleanOrigin);
  observations.push(dcrObs);

  // 6. MCP server OAuth metadata on mcp.<provider domain>, where many providers host their MCP server
  const mcpOrigin = `https://mcp.${registrableDomain(new URL(cleanOrigin).hostname)}`;
  if (mcpOrigin !== cleanOrigin) {
    const mcpObs = await oauthMetadata(mcpOrigin);
    observations.push({ ...mcpObs, probe: "mcpOauthMetadata" });
  }

  // 7. Composio track lookup (catalog snapshot) and live toolkit docs
  const slug = explicitSlug || normalizeSlug(origin);
  const [composioObs, composioDocsObs] = await Promise.all([composioTrack(slug), composioDocs(slug)]);
  observations.push(composioObs, composioDocsObs);

  return observations;
}
