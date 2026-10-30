# Prompt: Resolve App & Auth Origins

You are an expert OAuth and API integration researcher.
Given an input representing an application name, domain, or URL, resolve the canonical metadata required to probe its OAuth capabilities and Composio toolkit compatibility.

## Input
Application identifier: `{{input}}`

## Requirements
Extract and resolve:
1. `appName`: Official human-readable application name (e.g., "Linear", "Clockify", "Spotify").
2. `slug`: Lowercase, hyphenated or underscore slug suitable for toolkit lookup in Composio (e.g., "linear", "clockify", "spotify").
3. `origin`: The primary public HTTPS origin of the service (e.g., "https://linear.app").
4. `authDomain`: The HTTPS origin hosting the OAuth 2.0 endpoints or developer authorization server (e.g., "https://linear.app", "https://app.clockify.me").
5. `docsUrl`: The official documentation URL explaining OAuth 2.0 authentication, scopes, and app registration.
6. `devConsoleUrl`: The direct URL where developers create and configure OAuth apps.

## Output Format
Return ONLY valid JSON with no markdown fences, matching:
```json
{
  "appName": "string",
  "slug": "string",
  "origin": "https://...",
  "authDomain": "https://...",
  "docsUrl": "https://...",
  "devConsoleUrl": "https://...",
  "authorizationEndpoint": "url from official docs | null"
}
```
