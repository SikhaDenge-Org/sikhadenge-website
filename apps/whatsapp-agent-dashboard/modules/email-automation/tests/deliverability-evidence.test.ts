import assert from "node:assert/strict";

import {
  qualifyEmailDomainAuthentication,
  type EmailDeliverabilityDnsResolver,
} from "../application/deliverability-evidence-service";

function dnsError(code: string) {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  return error;
}

function googleResolver(): EmailDeliverabilityDnsResolver {
  return {
    async resolveTxt(hostname) {
      if (hostname === "example.com") return [["v=spf1 include:_spf.google.com ~all"]];
      if (hostname === "google._domainkey.example.com") return [["v=DKIM1; k=rsa; p=ABC123"]];
      if (hostname === "_dmarc.example.com") return [["v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"]];
      throw dnsError("ENOTFOUND");
    },
    async resolveCname() {
      throw dnsError("ENOTFOUND");
    },
  };
}

function microsoftResolver(): EmailDeliverabilityDnsResolver {
  return {
    async resolveTxt(hostname) {
      if (hostname === "example.org") return [["v=spf1 include:spf.protection.outlook.com -all"]];
      if (hostname === "_dmarc.example.org") return [["v=DMARC1; p=reject"]];
      throw dnsError("ENOTFOUND");
    },
    async resolveCname(hostname) {
      if (hostname === "selector1._domainkey.example.org") return ["selector1-example-org._domainkey.tenant.onmicrosoft.com"];
      if (hostname === "selector2._domainkey.example.org") return ["selector2-example-org._domainkey.tenant.onmicrosoft.com"];
      throw dnsError("ENOTFOUND");
    },
  };
}

async function testGoogleWorkspaceQualification() {
  const evidence = await qualifyEmailDomainAuthentication({
    domain: "example.com",
    provider: "GOOGLE_GMAIL",
    resolver: googleResolver(),
    env: {},
  });
  assert.equal(evidence.spfAligned, true);
  assert.equal(evidence.dkimAligned, true);
  assert.equal(evidence.dmarcAligned, true);
  assert.deepEqual(evidence.selectorsChecked, ["google"]);
  assert.deepEqual(evidence.selectorsPresent, ["google"]);
  assert.deepEqual(evidence.reasons, []);
}

async function testMicrosoft365Qualification() {
  const evidence = await qualifyEmailDomainAuthentication({
    domain: "example.org",
    provider: "MICROSOFT_365",
    resolver: microsoftResolver(),
    env: {},
  });
  assert.equal(evidence.spfAligned, true);
  assert.equal(evidence.dkimAligned, true);
  assert.equal(evidence.dmarcAligned, true);
  assert.deepEqual(evidence.selectorsChecked, ["selector1", "selector2"]);
  assert.deepEqual(evidence.selectorsPresent, ["selector1", "selector2"]);
}

async function testMissingAuthenticationFailsClosed() {
  const resolver: EmailDeliverabilityDnsResolver = {
    async resolveTxt() { throw dnsError("ENOTFOUND"); },
    async resolveCname() { throw dnsError("ENOTFOUND"); },
  };
  const evidence = await qualifyEmailDomainAuthentication({
    domain: "missing.example",
    provider: "GOOGLE_GMAIL",
    resolver,
    env: {},
  });
  assert.equal(evidence.spfAligned, false);
  assert.equal(evidence.dkimAligned, false);
  assert.equal(evidence.dmarcAligned, false);
  assert.match(evidence.reasons.join(" "), /SPF record was not found/i);
  assert.match(evidence.reasons.join(" "), /DKIM selectors are missing/i);
  assert.match(evidence.reasons.join(" "), /DMARC record was not found/i);
}

async function testTransientDnsFailureStaysUnknown() {
  const resolver: EmailDeliverabilityDnsResolver = {
    async resolveTxt(hostname) {
      if (hostname === "transient.example") throw dnsError("SERVFAIL");
      if (hostname === "google._domainkey.transient.example") return [["v=DKIM1; p=ABC"]];
      if (hostname === "_dmarc.transient.example") return [["v=DMARC1; p=none"]];
      throw dnsError("ENOTFOUND");
    },
    async resolveCname() { throw dnsError("ENOTFOUND"); },
  };
  const evidence = await qualifyEmailDomainAuthentication({
    domain: "transient.example",
    provider: "GOOGLE_GMAIL",
    resolver,
    env: {},
  });
  assert.equal(evidence.spfAligned, null);
  assert.equal(evidence.dkimAligned, true);
  assert.equal(evidence.dmarcAligned, true);
  assert.match(evidence.reasons.join(" "), /SPF DNS lookup failed/i);
}

async function testSelectorOverrideIsExplicit() {
  const resolver: EmailDeliverabilityDnsResolver = {
    async resolveTxt(hostname) {
      if (hostname === "custom.example") return [["v=spf1 include:_spf.google.com ~all"]];
      if (hostname === "custom._domainkey.custom.example") return [["v=DKIM1; p=ABC"]];
      if (hostname === "_dmarc.custom.example") return [["v=DMARC1; p=none"]];
      throw dnsError("ENOTFOUND");
    },
    async resolveCname() { throw dnsError("ENOTFOUND"); },
  };
  const evidence = await qualifyEmailDomainAuthentication({
    domain: "custom.example",
    provider: "GOOGLE_GMAIL",
    resolver,
    env: { EMAIL_DELIVERABILITY_DKIM_SELECTORS_GOOGLE_GMAIL: "custom" },
  });
  assert.equal(evidence.dkimAligned, true);
  assert.deepEqual(evidence.selectorsChecked, ["custom"]);
}

await testGoogleWorkspaceQualification();
await testMicrosoft365Qualification();
await testMissingAuthenticationFailsClosed();
await testTransientDnsFailureStaysUnknown();
await testSelectorOverrideIsExplicit();

console.log("Email P1 deliverability evidence contracts: PASS");
