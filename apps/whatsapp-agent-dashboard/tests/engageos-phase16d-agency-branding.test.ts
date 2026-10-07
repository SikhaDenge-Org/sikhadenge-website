import assert from "node:assert/strict";
import {
  createHash,
} from "node:crypto";
import fs from "node:fs";

import {
  AGENCY_CLIENT_ADMIN_PERMISSION,
  createAgencyClientDomainChallenge,
  normalizeCustomDomainHostname,
  readAgencyClientBranding,
  updateAgencyClientWhiteLabel,
  verifyAgencyClientDomainChallenge,
  type AgencyBrandingRepository,
  type AgencyClientLinkRecord,
  type AgencyMembershipRecord,
  type CustomDomainRecord,
  type WhiteLabelConfigInput,
  type WhiteLabelConfigRecord,
} from "../modules/saas/application/agency-branding-service";

class MemoryRepository
  implements AgencyBrandingRepository {

  links:
    AgencyClientLinkRecord[] = [];

  memberships:
    AgencyMembershipRecord[] = [];

  whiteLabels =
    new Map<
      string,
      WhiteLabelConfigRecord
    >();

  domains =
    new Map<
      string,
      CustomDomainRecord
    >();

  private sequence = 0;

  async findAgencyClientLink(
    input: {
      agencyWorkspaceId: string;
      clientWorkspaceId: string;
    },
  ) {
    return (
      this.links.find(
        (link) =>
          link.agencyWorkspaceId ===
            input.agencyWorkspaceId &&
          link.clientWorkspaceId ===
            input.clientWorkspaceId,
      ) ??
      null
    );
  }

  async findWorkspaceMembership(
    input: {
      workspaceId: string;
      userId: string;
    },
  ) {
    return (
      this.memberships.find(
        (membership) =>
          membership.workspaceId ===
            input.workspaceId &&
          membership.userId ===
            input.userId,
      ) ??
      null
    );
  }

  async getWhiteLabelConfig(
    workspaceId: string,
  ) {
    return (
      this.whiteLabels.get(
        workspaceId,
      ) ??
      null
    );
  }

  async upsertWhiteLabelConfig(
    input: {
      workspaceId: string;
      config:
        WhiteLabelConfigInput;
    },
  ) {
    const now =
      new Date(
        "2026-09-12T00:00:00.000Z",
      );

    const current =
      this.whiteLabels.get(
        input.workspaceId,
      );

    const row:
      WhiteLabelConfigRecord = {
        workspaceId:
          input.workspaceId,

        enabled:
          input.config.enabled,

        brandName:
          input.config.brandName ??
          null,

        logoUrl:
          input.config.logoUrl ??
          null,

        faviconUrl:
          input.config.faviconUrl ??
          null,

        primaryColor:
          input.config.primaryColor ??
          null,

        supportEmail:
          input.config.supportEmail ??
          null,

        createdAt:
          current?.createdAt ??
          now,

        updatedAt:
          now,
      };

    this.whiteLabels.set(
      input.workspaceId,
      row,
    );

    return row;
  }

  async listCustomDomains(
    workspaceId: string,
  ) {
    return [
      ...this.domains.values(),
    ].filter(
      (domain) =>
        domain.workspaceId ===
        workspaceId,
    );
  }

  async findCustomDomainByHostname(
    hostname: string,
  ) {
    return (
      this.domains.get(
        hostname,
      ) ??
      null
    );
  }

  async createCustomDomain(
    input: {
      workspaceId: string;
      hostname: string;
      verificationDigest: string;
    },
  ) {
    if (
      this.domains.has(
        input.hostname,
      )
    ) {
      throw new Error(
        "Custom domain hostname is already assigned.",
      );
    }

    this.sequence += 1;

    const now =
      new Date(
        "2026-09-12T00:00:00.000Z",
      );

    const row:
      CustomDomainRecord = {
        id:
          `domain-${this.sequence}`,

        workspaceId:
          input.workspaceId,

        hostname:
          input.hostname,

        status:
          "PENDING",

        verificationDigest:
          input.verificationDigest,

        verifiedAt:
          null,

        lastCheckedAt:
          null,

        createdAt:
          now,

        updatedAt:
          now,
      };

    this.domains.set(
      input.hostname,
      row,
    );

    return row;
  }

  async markCustomDomainVerified(
    input: {
      id: string;
      workspaceId: string;
      verificationDigest: string;
      verifiedAt: Date;
    },
  ) {
    const row =
      [
        ...this.domains.values(),
      ].find(
        (domain) =>
          domain.id ===
            input.id &&
          domain.workspaceId ===
            input.workspaceId,
      );

    if (
      !row ||
      row.status !==
        "PENDING" ||
      row.verificationDigest !==
        input.verificationDigest
    ) {
      throw new Error(
        "Custom domain verification state changed.",
      );
    }

    const updated:
      CustomDomainRecord = {
        ...row,

        status:
          "VERIFIED",

        verifiedAt:
          input.verifiedAt,

        lastCheckedAt:
          input.verifiedAt,

        updatedAt:
          input.verifiedAt,
      };

    this.domains.set(
      updated.hostname,
      updated,
    );

    return updated;
  }
}

async function main() {
  const repository =
    new MemoryRepository();

  repository.links.push(
    {
      agencyWorkspaceId:
        "agency-a",

      clientWorkspaceId:
        "client-a",

      status:
        "ACTIVE",
    },
    {
      agencyWorkspaceId:
        "agency-a",

      clientWorkspaceId:
        "client-b",

      status:
        "ACTIVE",
    },
  );

  // Relationship alone MUST NOT grant
  // administration.
  await assert.rejects(
    () =>
      updateAgencyClientWhiteLabel(
        repository,
        {
          actorUserId:
            "actor-1",

          agencyWorkspaceId:
            "agency-a",

          clientWorkspaceId:
            "client-a",

          config: {
            enabled: true,
          },
        },
      ),

    /Agency client administration denied/,
  );

  // Ordinary membership in the client workspace
  // does not count as agency administration.
  repository.memberships.push(
    {
      workspaceId:
        "client-a",

      userId:
        "actor-1",

      isActive:
        true,

      permissions: [
        AGENCY_CLIENT_ADMIN_PERMISSION,
      ],
    },
  );

  await assert.rejects(
    () =>
      updateAgencyClientWhiteLabel(
        repository,
        {
          actorUserId:
            "actor-1",

          agencyWorkspaceId:
            "agency-a",

          clientWorkspaceId:
            "client-a",

          config: {
            enabled: true,
          },
        },
      ),

    /Agency client administration denied/,
  );

  repository.memberships.push(
    {
      workspaceId:
        "agency-a",

      userId:
        "actor-1",

      isActive:
        true,

      permissions: [],
    },
  );

  // Agency membership without explicit
  // permission must still fail closed.
  await assert.rejects(
    () =>
      updateAgencyClientWhiteLabel(
        repository,
        {
          actorUserId:
            "actor-1",

          agencyWorkspaceId:
            "agency-a",

          clientWorkspaceId:
            "client-a",

          config: {
            enabled: true,
          },
        },
      ),

    /Agency client administration denied/,
  );

  repository.memberships =
    repository.memberships.map(
      (membership) =>
        membership.workspaceId ===
          "agency-a" &&
        membership.userId ===
          "actor-1"
          ? {
              ...membership,

              permissions: [
                AGENCY_CLIENT_ADMIN_PERMISSION,
              ],
            }
          : membership,
    );

  const clientA =
    await updateAgencyClientWhiteLabel(
      repository,
      {
        actorUserId:
          "actor-1",

        agencyWorkspaceId:
          "agency-a",

        clientWorkspaceId:
          "client-a",

        config: {
          enabled: true,

          brandName:
            " Client Alpha ",

          logoUrl:
            "https://cdn.example.com/a/logo.png",

          faviconUrl:
            "https://cdn.example.com/a/favicon.ico",

          primaryColor:
            "#12abef",

          supportEmail:
            "Support@Alpha.Example",
        },
      },
    );

  assert.equal(
    clientA.workspaceId,
    "client-a",
  );

  assert.equal(
    clientA.brandName,
    "Client Alpha",
  );

  assert.equal(
    clientA.primaryColor,
    "#12ABEF",
  );

  assert.equal(
    clientA.supportEmail,
    "support@alpha.example",
  );

  const clientB =
    await updateAgencyClientWhiteLabel(
      repository,
      {
        actorUserId:
          "actor-1",

        agencyWorkspaceId:
          "agency-a",

        clientWorkspaceId:
          "client-b",

        config: {
          enabled: true,

          brandName:
            "Client Beta",

          primaryColor:
            "#334455",
        },
      },
    );

  assert.equal(
    clientB.workspaceId,
    "client-b",
  );

  const readA =
    await readAgencyClientBranding(
      repository,
      {
        actorUserId:
          "actor-1",

        agencyWorkspaceId:
          "agency-a",

        clientWorkspaceId:
          "client-a",
      },
    );

  const readB =
    await readAgencyClientBranding(
      repository,
      {
        actorUserId:
          "actor-1",

        agencyWorkspaceId:
          "agency-a",

        clientWorkspaceId:
          "client-b",
      },
    );

  assert.equal(
    readA.whiteLabel?.brandName,
    "Client Alpha",
  );

  assert.equal(
    readB.whiteLabel?.brandName,
    "Client Beta",
  );

  assert.notEqual(
    readA.whiteLabel?.workspaceId,
    readB.whiteLabel?.workspaceId,
  );

  // Inactive agency link must fail closed.
  repository.links =
    repository.links.map(
      (link) =>
        link.clientWorkspaceId ===
          "client-a"
          ? {
              ...link,
              status:
                "SUSPENDED",
            }
          : link,
    );

  await assert.rejects(
    () =>
      readAgencyClientBranding(
        repository,
        {
          actorUserId:
            "actor-1",

          agencyWorkspaceId:
            "agency-a",

          clientWorkspaceId:
            "client-a",
        },
      ),

    /Agency client administration denied/,
  );

  repository.links =
    repository.links.map(
      (link) =>
        link.clientWorkspaceId ===
          "client-a"
          ? {
              ...link,
              status:
                "ACTIVE",
            }
          : link,
    );

  const challengeA =
    await createAgencyClientDomainChallenge(
      repository,
      {
        actorUserId:
          "actor-1",

        agencyWorkspaceId:
          "agency-a",

        clientWorkspaceId:
          "client-a",

        hostname:
          "Brand.Alpha.Example.",
      },
    );

  assert.equal(
    challengeA.domain.hostname,
    "brand.alpha.example",
  );

  assert.equal(
    challengeA.domain.workspaceId,
    "client-a",
  );

  assert.ok(
    challengeA.verificationToken.length >
      30,
  );

  const storedA =
    repository.domains.get(
      "brand.alpha.example",
    )!;

  assert.match(
    storedA.verificationDigest!,
    /^[0-9a-f]{64}$/,
  );

  assert.notEqual(
    storedA.verificationDigest,
    challengeA.verificationToken,
  );

  assert.equal(
    storedA.verificationDigest,
    createHash("sha256")
      .update(
        challengeA.verificationToken,
      )
      .digest("hex"),
  );

  await assert.rejects(
    () =>
      verifyAgencyClientDomainChallenge(
        repository,
        {
          actorUserId:
            "actor-1",

          agencyWorkspaceId:
            "agency-a",

          clientWorkspaceId:
            "client-a",

          hostname:
            "brand.alpha.example",

          verificationToken:
            "wrong-token",
        },
      ),

    /Custom domain verification failed/,
  );

  assert.equal(
    repository.domains.get(
      "brand.alpha.example",
    )?.status,
    "PENDING",
  );

  const verified =
    await verifyAgencyClientDomainChallenge(
      repository,
      {
        actorUserId:
          "actor-1",

        agencyWorkspaceId:
          "agency-a",

        clientWorkspaceId:
          "client-a",

        hostname:
          "brand.alpha.example",

        verificationToken:
          challengeA.verificationToken,

        verifiedAt:
          new Date(
            "2026-09-12T01:00:00.000Z",
          ),
      },
    );

  assert.equal(
    verified.status,
    "VERIFIED",
  );

  assert.equal(
    verified.workspaceId,
    "client-a",
  );

  assert.ok(
    !(
      "verificationDigest"
      in verified
    ),
  );

  // Global hostname uniqueness.
  await assert.rejects(
    () =>
      createAgencyClientDomainChallenge(
        repository,
        {
          actorUserId:
            "actor-1",

          agencyWorkspaceId:
            "agency-a",

          clientWorkspaceId:
            "client-b",

          hostname:
            "brand.alpha.example",
        },
      ),

    /already assigned/,
  );

  const challengeB =
    await createAgencyClientDomainChallenge(
      repository,
      {
        actorUserId:
          "actor-1",

        agencyWorkspaceId:
          "agency-a",

        clientWorkspaceId:
          "client-b",

        hostname:
          "brand.beta.example",
      },
    );

  // A client cannot verify B client's domain.
  await assert.rejects(
    () =>
      verifyAgencyClientDomainChallenge(
        repository,
        {
          actorUserId:
            "actor-1",

          agencyWorkspaceId:
            "agency-a",

          clientWorkspaceId:
            "client-a",

          hostname:
            "brand.beta.example",

          verificationToken:
            challengeB.verificationToken,
        },
      ),

    /Custom domain verification failed/,
  );

  assert.equal(
    normalizeCustomDomainHostname(
      "Portal.Example.COM.",
    ),
    "portal.example.com",
  );

  assert.throws(
    () =>
      normalizeCustomDomainHostname(
        "https://example.com/path",
      ),

    /invalid/,
  );

  assert.throws(
    () =>
      normalizeCustomDomainHostname(
        "127.0.0.1",
      ),

    /invalid/,
  );

  const adapter =
    fs.readFileSync(
      "modules/saas/infrastructure/prisma-agency-branding-repository.ts",
      "utf8",
    );

  assert.match(
    adapter,
    /agencyWorkspaceId_workspaceId/,
  );

  assert.match(
    adapter,
    /workspaceId_userId/,
  );

  assert.match(
    adapter,
    /engageWhiteLabelConfig/,
  );

  assert.match(
    adapter,
    /engageCustomDomain/,
  );

  assert.match(
    adapter,
    /updateMany/,
  );

  assert.match(
    adapter,
    /workspaceId/,
  );

  assert.doesNotMatch(
    adapter,
    /cloudflare|route53|vercel|dns\.resolve|fetch\(/i,
  );

  const service =
    fs.readFileSync(
      "modules/saas/application/agency-branding-service.ts",
      "utf8",
    );

  assert.match(
    service,
    /agency\.clients\.admin/,
  );

  assert.match(
    service,
    /timingSafeEqual/,
  );

  assert.match(
    service,
    /randomBytes/,
  );

  console.log(
    "EngageOS Phase 16D agency/branding isolation: PASS",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
