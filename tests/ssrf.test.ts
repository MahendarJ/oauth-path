import test from "node:test";
import assert from "node:assert/strict";
import { isPrivateOrBlockedIP, validateSafeUrl, redactUrlQuery } from "../lib/probes/ssrf";

test("isPrivateOrBlockedIP correctly identifies blocked IP ranges", () => {
  // Loopback
  assert.equal(isPrivateOrBlockedIP("127.0.0.1"), true);
  assert.equal(isPrivateOrBlockedIP("127.0.1.1"), true);
  assert.equal(isPrivateOrBlockedIP("::1"), true);

  // Private 10.x.x.x
  assert.equal(isPrivateOrBlockedIP("10.0.0.1"), true);
  assert.equal(isPrivateOrBlockedIP("10.254.12.3"), true);

  // Link-local / Cloud metadata 169.254.x.x
  assert.equal(isPrivateOrBlockedIP("169.254.169.254"), true);
  assert.equal(isPrivateOrBlockedIP("169.254.0.1"), true);

  // Private 172.16.x - 172.31.x
  assert.equal(isPrivateOrBlockedIP("172.16.0.1"), true);
  assert.equal(isPrivateOrBlockedIP("172.31.255.255"), true);
  assert.equal(isPrivateOrBlockedIP("172.15.0.1"), false); // public
  assert.equal(isPrivateOrBlockedIP("172.32.0.1"), false); // public

  // Private 192.168.x.x
  assert.equal(isPrivateOrBlockedIP("192.168.1.1"), true);
  assert.equal(isPrivateOrBlockedIP("192.168.0.254"), true);

  // IPv6 Unique Local (fc00::/7) and Link-Local (fe80::/10)
  assert.equal(isPrivateOrBlockedIP("fc00::1"), true);
  assert.equal(isPrivateOrBlockedIP("fd12:3456::1"), true);
  assert.equal(isPrivateOrBlockedIP("fe80::1"), true);

  // Public IP addresses
  assert.equal(isPrivateOrBlockedIP("8.8.8.8"), false);
  assert.equal(isPrivateOrBlockedIP("1.1.1.1"), false);
  assert.equal(isPrivateOrBlockedIP("93.184.216.34"), false); // example.com
});

test("validateSafeUrl rejects non-HTTPS protocols", async () => {
  await assert.rejects(
    () => validateSafeUrl("http://example.com"),
    /Non-HTTPS protocol rejected/
  );
  await assert.rejects(
    () => validateSafeUrl("ftp://example.com"),
    /Non-HTTPS protocol rejected/
  );
});

test("validateSafeUrl rejects localhost and non-public hostnames", async () => {
  await assert.rejects(
    () => validateSafeUrl("https://localhost"),
    /"localhost" is rejected/
  );
  await assert.rejects(
    () => validateSafeUrl("https://localhost:8080/callback"),
    /"localhost" is rejected/
  );
  await assert.rejects(
    () => validateSafeUrl("https://service.internal/oauth"),
    /Non-public hostname rejected/
  );
  await assert.rejects(
    () => validateSafeUrl("https://my-app.local"),
    /Non-public hostname rejected/
  );
});

test("validateSafeUrl rejects 127.0.0.1, 10.x, 169.254.x, and private IPs", async () => {
  await assert.rejects(
    () => validateSafeUrl("https://127.0.0.1/oauth"),
    /Private\/loopback\/link-local IP rejected/
  );
  await assert.rejects(
    () => validateSafeUrl("https://10.0.0.5:8443/auth"),
    /Private\/loopback\/link-local IP rejected/
  );
  await assert.rejects(
    () => validateSafeUrl("https://169.254.169.254/latest/meta-data"),
    /Private\/loopback\/link-local IP rejected/
  );
  await assert.rejects(
    () => validateSafeUrl("https://192.168.1.1/admin"),
    /Private\/loopback\/link-local IP rejected/
  );
});

test("redactUrlQuery redacts query parameter values properly", () => {
  const result = redactUrlQuery(
    "https://accounts.spotify.com/en/login?continue=https%3A%2F%2Faccounts.spotify.com%2Fauthorize%3Fclient_id%3Dxyz&mode=desktop"
  );
  assert.equal(result.host, "accounts.spotify.com");
  assert.equal(result.path, "/en/login");
  assert.ok(result.redactedLocation?.includes("continue=%5BREDACTED%5D") || result.redactedLocation?.includes("continue=[REDACTED]"));
  assert.ok(result.redactedLocation?.includes("mode=%5BREDACTED%5D") || result.redactedLocation?.includes("mode=[REDACTED]"));
  assert.ok(!result.redactedLocation?.includes("client_id%3Dxyz"));
});
