import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import {
  isIP,
} from "node:net";

import {
  domainToASCII,
} from "node:url";

export const AGENCY_CLIENT_ADMIN_PERMISSION =
  "agency.clients.admin" as const;

export type AgencyClientLinkRecord = {
  agencyWorkspaceId: string;
  clientWorkspaceId: string;
  status: string;
};

export type AgencyMembershipRecord = {
  workspaceId: string;
  userId: string;
  isActive: boolean;
  permissions: readonly string[];
};

export type WhiteLabelConfigRecord = {
  workspaceId: string;
  enabled: boolean;
  brandName: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  supportEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type WhiteLabelConfigInput = {
  enabled: boolean;
  brandName?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor?: string | null;
  supportEmail?: string | null;
};

export type CustomDomainRecord = {
  id: string;
  workspaceId: string;
  hostname: string;
  status: string;
  verificationDigest: string | null;
  verifiedAt: Date | null;
  lastCheckedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicCustomDomain =
  Omit<
    CustomDomainRecord,
    "verificationDigest"
  >;

export interface AgencyBrandingRepository {
  findAgencyClientLink(
    input: {
      agencyWorkspaceId: string;
      clientWorkspaceId: string;
    },
  ): Promise<
    AgencyClientLinkRecord | null
  >;

  findWorkspaceMembership(
    input: {
      workspaceId: string;
      userId: string;
    },
  ): Promise<
    AgencyMembershipRecord | null
  >;

  getWhiteLabelConfig(
    workspaceId: string,
  ): Promise<
    WhiteLabelConfigRecord | null
  >;

  upsertWhiteLabelConfig(
    input: {
      workspaceId: string;
      config: WhiteLabelConfigInput;
    },
  ): Promise<
    WhiteLabelConfigRecord
  >;

  listCustomDomains(
    workspaceId: string,
  ): Promise<
    readonly CustomDomainRecord[]
  >;

  findCustomDomainByHostname(
    hostname: string,
  ): Promise<
    CustomDomainRecord | null
  >;

  createCustomDomain(
    input: {
      workspaceId: string;
      hostname: string;
      verificationDigest: string;
    },
  ): Promise<
    CustomDomainRecord
  >;

  markCustomDomainVerified(
    input: {
      id: string;
      workspaceId: string;
      verificationDigest: string;
      verifiedAt: Date;
    },
  ): Promise<
    CustomDomainRecord
  >;
}

function requireText(
  value: string,
  field: string,
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `${field} is required.`,
    );
  }

  return normalized;
}

function normalizeOptionalText(
  value: string | null | undefined,
  field: string,
  maxLength: number,
): string | null {
  if (value == null) {
    return null;
  }

  const normalized =
    value.trim();

  if (!normalized) {
    return null;
  }

  if (
    normalized.length >
    maxLength
  ) {
    throw new Error(
      `${field} is too long.`,
    );
  }

  return normalized;
}

function normalizeHttpsUrl(
  value: string | null | undefined,
  field: string,
): string | null {
  const normalized =
    normalizeOptionalText(
      value,
      field,
      2048,
    );

  if (!normalized) {
    return null;
  }

  let parsed: URL;

  try {
    parsed =
      new URL(normalized);
  } catch {
    throw new Error(
      `${field} must be a valid HTTPS URL.`,
    );
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error(
      `${field} must be a valid HTTPS URL.`,
    );
  }

  return parsed.toString();
}

function normalizeSupportEmail(
  value: string | null | undefined,
): string | null {
  const normalized =
    normalizeOptionalText(
      value,
      "supportEmail",
      320,
    );

  if (!normalized) {
    return null;
  }

  const email =
    normalized.toLowerCase();

  if (
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(
      email,
    )
  ) {
    throw new Error(
      "supportEmail is invalid.",
    );
  }

  return email;
}

function normalizePrimaryColor(
  value: string | null | undefined,
): string | null {
  const normalized =
    normalizeOptionalText(
      value,
      "primaryColor",
      7,
    );

  if (!normalized) {
    return null;
  }

  if (
    !/^#[0-9a-fA-F]{6}$/.test(
      normalized,
    )
  ) {
    throw new Error(
      "primaryColor must use #RRGGBB format.",
    );
  }

  return normalized.toUpperCase();
}

export function normalizeWhiteLabelConfig(
  input: WhiteLabelConfigInput,
): WhiteLabelConfigInput {
  if (
    typeof input.enabled !==
    "boolean"
  ) {
    throw new Error(
      "enabled must be boolean.",
    );
  }

  return {
    enabled:
      input.enabled,

    brandName:
      normalizeOptionalText(
        input.brandName,
        "brandName",
        120,
      ),

    logoUrl:
      normalizeHttpsUrl(
        input.logoUrl,
        "logoUrl",
      ),

    faviconUrl:
      normalizeHttpsUrl(
        input.faviconUrl,
        "faviconUrl",
      ),

    primaryColor:
      normalizePrimaryColor(
        input.primaryColor,
      ),

    supportEmail:
      normalizeSupportEmail(
        input.supportEmail,
      ),
  };
}

export function normalizeCustomDomainHostname(
  value: string,
): string {
  const raw =
    requireText(
      value,
      "hostname",
    )
      .replace(/\.$/, "");

  const ascii =
    domainToASCII(raw)
      .toLowerCase();

  if (
    !ascii ||
    ascii.length > 253 ||
    !ascii.includes(".") ||
    isIP(ascii) !== 0
  ) {
    throw new Error(
      "Custom domain hostname is invalid.",
    );
  }

  const labels =
    ascii.split(".");

  for (
    const label of labels
  ) {
    if (
      label.length < 1 ||
      label.length > 63 ||
      !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(
        label,
      )
    ) {
      throw new Error(
        "Custom domain hostname is invalid.",
      );
    }
  }

  return ascii;
}

function digestVerificationToken(
  token: string,
): string {
  return createHash("sha256")
    .update(
      requireText(
        token,
        "verificationToken",
      ),
    )
    .digest("hex");
}

function verificationTokenMatches(
  token: string,
  digest: string | null,
): boolean {
  if (
    !digest ||
    !/^[0-9a-f]{64}$/.test(
      digest,
    )
  ) {
    return false;
  }

  let actual: Buffer;
  let expected: Buffer;

  try {
    actual =
      Buffer.from(
        digestVerificationToken(
          token,
        ),
        "hex",
      );

    expected =
      Buffer.from(
        digest,
        "hex",
      );
  } catch {
    return false;
  }

  return (
    actual.length ===
      expected.length &&
    timingSafeEqual(
      actual,
      expected,
    )
  );
}

function toPublicDomain(
  record: CustomDomainRecord,
): PublicCustomDomain {
  const {
    verificationDigest:
      _verificationDigest,
    ...publicRecord
  } = record;

  return publicRecord;
}

export async function assertAgencyClientAdministration(
  repository:
    AgencyBrandingRepository,
  input: {
    actorUserId: string;
    agencyWorkspaceId: string;
    clientWorkspaceId: string;
  },
): Promise<void> {
  const actorUserId =
    requireText(
      input.actorUserId,
      "actorUserId",
    );

  const agencyWorkspaceId =
    requireText(
      input.agencyWorkspaceId,
      "agencyWorkspaceId",
    );

  const clientWorkspaceId =
    requireText(
      input.clientWorkspaceId,
      "clientWorkspaceId",
    );

  if (
    agencyWorkspaceId ===
    clientWorkspaceId
  ) {
    throw new Error(
      "Agency and client workspaces must be different.",
    );
  }

  const [
    link,
    membership,
  ] = await Promise.all([
    repository
      .findAgencyClientLink({
        agencyWorkspaceId,
        clientWorkspaceId,
      }),

    repository
      .findWorkspaceMembership({
        workspaceId:
          agencyWorkspaceId,

        userId:
          actorUserId,
      }),
  ]);

  const activeLink =
    link &&
    link.agencyWorkspaceId ===
      agencyWorkspaceId &&
    link.clientWorkspaceId ===
      clientWorkspaceId &&
    link.status
      .trim()
      .toUpperCase() ===
      "ACTIVE";

  const authorizedMember =
    membership &&
    membership.workspaceId ===
      agencyWorkspaceId &&
    membership.userId ===
      actorUserId &&
    membership.isActive &&
    membership.permissions.includes(
      AGENCY_CLIENT_ADMIN_PERMISSION,
    );

  if (
    !activeLink ||
    !authorizedMember
  ) {
    throw new Error(
      "Agency client administration denied.",
    );
  }
}

export async function readAgencyClientBranding(
  repository:
    AgencyBrandingRepository,
  input: {
    actorUserId: string;
    agencyWorkspaceId: string;
    clientWorkspaceId: string;
  },
): Promise<{
  whiteLabel:
    WhiteLabelConfigRecord | null;
  customDomains:
    readonly PublicCustomDomain[];
}> {
  await assertAgencyClientAdministration(
    repository,
    input,
  );

  const [
    whiteLabel,
    domains,
  ] = await Promise.all([
    repository
      .getWhiteLabelConfig(
        input.clientWorkspaceId,
      ),

    repository
      .listCustomDomains(
        input.clientWorkspaceId,
      ),
  ]);

  if (
    whiteLabel &&
    whiteLabel.workspaceId !==
      input.clientWorkspaceId
  ) {
    throw new Error(
      "White-label workspace isolation failed.",
    );
  }

  for (
    const domain of domains
  ) {
    if (
      domain.workspaceId !==
      input.clientWorkspaceId
    ) {
      throw new Error(
        "Custom-domain workspace isolation failed.",
      );
    }
  }

  return {
    whiteLabel,

    customDomains:
      domains.map(
        toPublicDomain,
      ),
  };
}

export async function updateAgencyClientWhiteLabel(
  repository:
    AgencyBrandingRepository,
  input: {
    actorUserId: string;
    agencyWorkspaceId: string;
    clientWorkspaceId: string;
    config: WhiteLabelConfigInput;
  },
): Promise<
  WhiteLabelConfigRecord
> {
  await assertAgencyClientAdministration(
    repository,
    input,
  );

  const config =
    normalizeWhiteLabelConfig(
      input.config,
    );

  const saved =
    await repository
      .upsertWhiteLabelConfig({
        workspaceId:
          input.clientWorkspaceId,

        config,
      });

  if (
    saved.workspaceId !==
    input.clientWorkspaceId
  ) {
    throw new Error(
      "White-label workspace isolation failed.",
    );
  }

  return saved;
}

export async function createAgencyClientDomainChallenge(
  repository:
    AgencyBrandingRepository,
  input: {
    actorUserId: string;
    agencyWorkspaceId: string;
    clientWorkspaceId: string;
    hostname: string;
  },
): Promise<{
  domain:
    PublicCustomDomain;
  verificationToken: string;
}> {
  await assertAgencyClientAdministration(
    repository,
    input,
  );

  const hostname =
    normalizeCustomDomainHostname(
      input.hostname,
    );

  const verificationToken =
    randomBytes(32)
      .toString("base64url");

  const verificationDigest =
    digestVerificationToken(
      verificationToken,
    );

  const created =
    await repository
      .createCustomDomain({
        workspaceId:
          input.clientWorkspaceId,

        hostname,
        verificationDigest,
      });

  if (
    created.workspaceId !==
      input.clientWorkspaceId ||
    created.hostname !==
      hostname
  ) {
    throw new Error(
      "Custom-domain workspace isolation failed.",
    );
  }

  return {
    domain:
      toPublicDomain(
        created,
      ),

    verificationToken,
  };
}

export async function verifyAgencyClientDomainChallenge(
  repository:
    AgencyBrandingRepository,
  input: {
    actorUserId: string;
    agencyWorkspaceId: string;
    clientWorkspaceId: string;
    hostname: string;
    verificationToken: string;
    verifiedAt?: Date;
  },
): Promise<
  PublicCustomDomain
> {
  await assertAgencyClientAdministration(
    repository,
    input,
  );

  const hostname =
    normalizeCustomDomainHostname(
      input.hostname,
    );

  const domain =
    await repository
      .findCustomDomainByHostname(
        hostname,
      );

  if (
    !domain ||
    domain.workspaceId !==
      input.clientWorkspaceId ||
    domain.status
      .trim()
      .toUpperCase() !==
      "PENDING" ||
    !verificationTokenMatches(
      input.verificationToken,
      domain.verificationDigest,
    )
  ) {
    throw new Error(
      "Custom domain verification failed.",
    );
  }

  const verifiedAt =
    input.verifiedAt ??
    new Date();

  if (
    !Number.isFinite(
      verifiedAt.getTime(),
    )
  ) {
    throw new Error(
      "verifiedAt is invalid.",
    );
  }

  const updated =
    await repository
      .markCustomDomainVerified({
        id:
          domain.id,

        workspaceId:
          input.clientWorkspaceId,

        verificationDigest:
          domain.verificationDigest!,

        verifiedAt,
      });

  if (
    updated.workspaceId !==
      input.clientWorkspaceId ||
    updated.hostname !==
      hostname ||
    updated.status !==
      "VERIFIED"
  ) {
    throw new Error(
      "Custom-domain verification state failed.",
    );
  }

  return toPublicDomain(
    updated,
  );
}
