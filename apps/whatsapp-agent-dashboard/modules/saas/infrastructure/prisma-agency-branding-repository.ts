import {
  Prisma,
  type EngageAgencyWorkspaceLink,
  type EngageCustomDomain,
  type EngageWhiteLabelConfig,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/db/prisma";

import type {
  AgencyBrandingRepository,
  AgencyClientLinkRecord,
  CustomDomainRecord,
  WhiteLabelConfigRecord,
} from "@/modules/saas/application/agency-branding-service";

function mapLink(
  row:
    EngageAgencyWorkspaceLink,
): AgencyClientLinkRecord {
  return {
    agencyWorkspaceId:
      row.agencyWorkspaceId,

    clientWorkspaceId:
      row.workspaceId,

    status:
      row.status,
  };
}

function mapWhiteLabel(
  row:
    EngageWhiteLabelConfig,
): WhiteLabelConfigRecord {
  return {
    workspaceId:
      row.workspaceId,

    enabled:
      row.enabled,

    brandName:
      row.brandName,

    logoUrl:
      row.logoUrl,

    faviconUrl:
      row.faviconUrl,

    primaryColor:
      row.primaryColor,

    supportEmail:
      row.supportEmail,

    createdAt:
      row.createdAt,

    updatedAt:
      row.updatedAt,
  };
}

function mapDomain(
  row:
    EngageCustomDomain,
): CustomDomainRecord {
  return {
    id:
      row.id,

    workspaceId:
      row.workspaceId,

    hostname:
      row.hostname,

    status:
      row.status,

    verificationDigest:
      row.verificationDigest,

    verifiedAt:
      row.verifiedAt,

    lastCheckedAt:
      row.lastCheckedAt,

    createdAt:
      row.createdAt,

    updatedAt:
      row.updatedAt,
  };
}

export const prismaAgencyBrandingRepository:
  AgencyBrandingRepository = {

  async findAgencyClientLink(
    input,
  ) {
    const row =
      await prisma
        .engageAgencyWorkspaceLink
        .findUnique({
          where: {
            agencyWorkspaceId_workspaceId: {
              agencyWorkspaceId:
                input.agencyWorkspaceId,

              workspaceId:
                input.clientWorkspaceId,
            },
          },
        });

    return row
      ? mapLink(row)
      : null;
  },

  async findWorkspaceMembership(
    input,
  ) {
    const row =
      await prisma
        .engageWorkspaceMembership
        .findUnique({
          where: {
            workspaceId_userId: {
              workspaceId:
                input.workspaceId,

              userId:
                input.userId,
            },
          },

          include: {
            permissions: {
              select: {
                permission: true,
              },
            },
          },
        });

    if (!row) {
      return null;
    }

    return {
      workspaceId:
        row.workspaceId,

      userId:
        row.userId,

      isActive:
        row.isActive,

      permissions:
        row.permissions.map(
          (permission) =>
            permission.permission,
        ),
    };
  },

  async getWhiteLabelConfig(
    workspaceId,
  ) {
    const row =
      await prisma
        .engageWhiteLabelConfig
        .findUnique({
          where: {
            workspaceId,
          },
        });

    return row
      ? mapWhiteLabel(row)
      : null;
  },

  async upsertWhiteLabelConfig(
    input,
  ) {
    const row =
      await prisma
        .engageWhiteLabelConfig
        .upsert({
          where: {
            workspaceId:
              input.workspaceId,
          },

          create: {
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
          },

          update: {
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
          },
        });

    return mapWhiteLabel(
      row,
    );
  },

  async listCustomDomains(
    workspaceId,
  ) {
    const rows =
      await prisma
        .engageCustomDomain
        .findMany({
          where: {
            workspaceId,
          },

          orderBy: {
            createdAt: "asc",
          },
        });

    return rows.map(
      mapDomain,
    );
  },

  async findCustomDomainByHostname(
    hostname,
  ) {
    const row =
      await prisma
        .engageCustomDomain
        .findUnique({
          where: {
            hostname,
          },
        });

    return row
      ? mapDomain(row)
      : null;
  },

  async createCustomDomain(
    input,
  ) {
    try {
      const row =
        await prisma
          .engageCustomDomain
          .create({
            data: {
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
            },
          });

      return mapDomain(
        row,
      );
    } catch (error) {
      if (
        error instanceof
          Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new Error(
          "Custom domain hostname is already assigned.",
        );
      }

      throw error;
    }
  },

  async markCustomDomainVerified(
    input,
  ) {
    const result =
      await prisma
        .engageCustomDomain
        .updateMany({
          where: {
            id:
              input.id,

            workspaceId:
              input.workspaceId,

            status:
              "PENDING",

            verificationDigest:
              input.verificationDigest,
          },

          data: {
            status:
              "VERIFIED",

            verifiedAt:
              input.verifiedAt,

            lastCheckedAt:
              input.verifiedAt,
          },
        });

    if (
      result.count !== 1
    ) {
      throw new Error(
        "Custom domain verification state changed.",
      );
    }

    const row =
      await prisma
        .engageCustomDomain
        .findFirst({
          where: {
            id:
              input.id,

            workspaceId:
              input.workspaceId,
          },
        });

    if (!row) {
      throw new Error(
        "Verified custom domain could not be loaded.",
      );
    }

    return mapDomain(
      row,
    );
  },
};
