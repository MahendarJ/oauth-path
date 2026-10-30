import { safeFetch } from "./ssrf";
import { ProbeObservation } from "./types";

export interface ExtractedOAuthMetadata {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  registration_endpoint?: string;
  revocation_endpoint?: string;
  device_authorization_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  code_challenge_methods_supported?: string[];
  grant_types_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  client_id_metadata_document_supported?: boolean | string;
}

export async function oauthMetadata(origin: string): Promise<ProbeObservation> {
  const cleanOrigin = origin.replace(/\/+$/, "");
  const checkedAt = new Date().toISOString();
  const oauthServerUrl = `${cleanOrigin}/.well-known/oauth-authorization-server`;
  const openIdUrl = `${cleanOrigin}/.well-known/openid-configuration`;

  const facts: Record<string, unknown> = {
    endpointsChecked: [oauthServerUrl, openIdUrl],
    discovered: false,
    sourceEndpoint: null,
    metadata: null,
  };

  // 1. Try RFC 8414 /.well-known/oauth-authorization-server
  const res = await safeFetch(oauthServerUrl).catch((err) => ({
    status: 0,
    statusText: err.message,
    headers: new Headers(),
    data: "",
    json: null,
  }));

  let sourceEndpoint = oauthServerUrl;
  let successfulRes = res.status >= 200 && res.status < 300 && res.json ? res : null;

  // 2. If not found, try OpenID Discovery /.well-known/openid-configuration
  if (!successfulRes) {
    const oidcRes = await safeFetch(openIdUrl).catch((err) => ({
      status: 0,
      statusText: err.message,
      headers: new Headers(),
      data: "",
      json: null,
    }));
    if (oidcRes.status >= 200 && oidcRes.status < 300 && oidcRes.json) {
      successfulRes = oidcRes;
      sourceEndpoint = openIdUrl;
    }
  }

  if (successfulRes && successfulRes.json && typeof successfulRes.json === "object") {
    const doc = successfulRes.json as Record<string, unknown>;

    // Keep ONLY the 12 specified fields, drop 'raw'
    const extracted: ExtractedOAuthMetadata = {
      issuer: typeof doc.issuer === "string" ? doc.issuer : undefined,
      authorization_endpoint:
        typeof doc.authorization_endpoint === "string"
          ? doc.authorization_endpoint
          : undefined,
      token_endpoint:
        typeof doc.token_endpoint === "string" ? doc.token_endpoint : undefined,
      registration_endpoint:
        typeof doc.registration_endpoint === "string"
          ? doc.registration_endpoint
          : undefined,
      revocation_endpoint:
        typeof doc.revocation_endpoint === "string"
          ? doc.revocation_endpoint
          : undefined,
      device_authorization_endpoint:
        typeof doc.device_authorization_endpoint === "string"
          ? doc.device_authorization_endpoint
          : undefined,
      scopes_supported: Array.isArray(doc.scopes_supported)
        ? (doc.scopes_supported as string[])
        : undefined,
      response_types_supported: Array.isArray(doc.response_types_supported)
        ? (doc.response_types_supported as string[])
        : Array.isArray(doc.response_type_supported)
        ? (doc.response_type_supported as string[])
        : undefined,
      code_challenge_methods_supported: Array.isArray(
        doc.code_challenge_methods_supported
      )
        ? (doc.code_challenge_methods_supported as string[])
        : undefined,
      grant_types_supported: Array.isArray(doc.grant_types_supported)
        ? (doc.grant_types_supported as string[])
        : undefined,
      token_endpoint_auth_methods_supported: Array.isArray(
        doc.token_endpoint_auth_methods_supported
      )
        ? (doc.token_endpoint_auth_methods_supported as string[])
        : undefined,
      client_id_metadata_document_supported:
        doc.client_id_metadata_document_supported !== undefined
          ? (doc.client_id_metadata_document_supported as boolean | string)
          : undefined,
    };

    facts.discovered = true;
    facts.sourceEndpoint = sourceEndpoint;
    facts.metadata = extracted;

    return {
      probe: "oauthMetadata",
      url: sourceEndpoint,
      checkedAt,
      status: successfulRes.status,
      facts,
      evidence: "tested",
    };
  }

  return {
    probe: "oauthMetadata",
    url: oauthServerUrl,
    checkedAt,
    status: res.status || 404,
    error: "No well-known OAuth authorization server or OpenID configuration found",
    facts,
    evidence: "tested",
  };
}
