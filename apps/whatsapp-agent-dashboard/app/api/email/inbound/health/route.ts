import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import {
  EmailDashboardAccessError,
  requireEmailManagerAccess,
} from "@/modules/email-automation/application/dashboard-access";
import { buildEmailE1Runtime } from "@/modules/email-automation/infrastructure/runtime";
import { GmailEmailProviderAdapter } from "@/modules/email-automation/providers/gmail/gmail-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function inboundState(value: unknown) {
  return asRecord(asRecord(value).gmailInbound);
}

function hasActivationSender(value: unknown, activationAccount: string): boolean {
  const emailAutomation = asRecord(asRecord(value).emailAutomation);
  const senders = Array.isArray(emailAutomation.senderIdentities)
    ? emailAutomation.senderIdentities
    : [];
  return senders.some((raw) => {
    const sender = asRecord(raw);
    return typeof sender.fromEmail === "string" &&
      sender.fromEmail.trim().toLowerCase() === activationAccount &&
      sender.verificationStatus === "VERIFIED" &&
      sender.isActive === true;
  });
}

export async function GET() {
  try {
    const access = await requireEmailManagerAccess();
    const activationAccount = (
      process.env.EMAIL_INBOUND_ACTIVATION_ACCOUNT?.trim() ||
      "support@sikhadenge.in"
    ).toLowerCase();
    const activationWorkspaceId =
      process.env.EMAIL_INBOUND_ACTIVATION_WORKSPACE_ID?.trim() || "engagews_default";
    const activationWorkspaceReady = access.workspaceId === activationWorkspaceId;

    if (!activationWorkspaceReady) {
      return NextResponse.json(
        {
          activationAccount,
          activationWorkspaceId,
          currentWorkspaceId: access.workspaceId,
          activationWorkspaceReady: false,
          activationConnectionReady: false,
          gmailConnected: false,
          connectedGmailConnections: 0,
          matchingActivationConnections: 0,
          readAccess: false,
          readAccessStatus: "WRONG_WORKSPACE",
          statusCode: 0,
          probeError: `Production Gmail inbound is pinned to workspace ${activationWorkspaceId}; current workspace is ${access.workspaceId}.`,
          authorizedConnectionId: null,
          inboundSyncEnabled: process.env.EMAIL_INBOUND_SYNC_ENABLED === "true",
          inboundMode: process.env.EMAIL_GMAIL_INBOUND_MODE?.trim().toUpperCase() || "POLLING",
          cursorReadyConnections: 0,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const connections = await prisma.engageChannelConnection.findMany({
      where: {
        workspaceId: activationWorkspaceId,
        channel: "EMAIL",
        status: "CONNECTED",
      },
      select: {
        id: true,
        capabilities: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const gmail = connections.filter(
      (row) => asRecord(row.capabilities).emailProvider === "GOOGLE_GMAIL",
    );
    const activationMatches = gmail.filter((row) =>
      hasActivationSender(row.capabilities, activationAccount)
    );

    const runtime = buildEmailE1Runtime();
    const adapter = runtime.providers.get("GOOGLE_GMAIL");
    let readAccess = false;
    let statusCode = 0;
    let probeError = "";
    let authorizedConnectionId: string | null = null;

    if (!(adapter instanceof GmailEmailProviderAdapter)) {
      probeError = "Gmail provider is unavailable.";
    } else if (activationMatches.length !== 1) {
      probeError = `Expected exactly one connected Gmail connection for ${activationAccount}; found ${activationMatches.length}.`;
    } else {
      const connection = activationMatches[0];
      try {
        const token = await adapter.getAccessTokenForConnection(
          activationWorkspaceId,
          connection.id,
        );
        const response = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/profile",
          {
            headers: { authorization: `Bearer ${token}` },
            cache: "no-store",
          },
        );
        statusCode = response.status;
        if (response.ok) {
          readAccess = true;
          authorizedConnectionId = connection.id;
        } else {
          probeError = `Gmail profile probe returned HTTP ${response.status}`;
        }
      } catch (error) {
        probeError = error instanceof Error
          ? error.message
          : "Gmail Inbox access probe failed.";
      }
    }

    const cursorReady = activationMatches.filter((row) => {
      const state = inboundState(row.capabilities);
      return typeof state.historyId === "string" && state.historyId.trim().length > 0;
    }).length;

    return NextResponse.json(
      {
        activationAccount,
        activationWorkspaceId,
        currentWorkspaceId: access.workspaceId,
        activationWorkspaceReady,
        activationConnectionReady: activationWorkspaceReady && activationMatches.length === 1,
        gmailConnected: gmail.length > 0,
        connectedGmailConnections: gmail.length,
        matchingActivationConnections: activationMatches.length,
        readAccess,
        readAccessStatus: readAccess ? "AUTHORIZED" : activationWorkspaceReady ? "NEEDS_AUTHORIZATION" : "WRONG_WORKSPACE",
        statusCode,
        probeError,
        authorizedConnectionId,
        inboundSyncEnabled: process.env.EMAIL_INBOUND_SYNC_ENABLED === "true",
        inboundMode: process.env.EMAIL_GMAIL_INBOUND_MODE?.trim().toUpperCase() || "POLLING",
        cursorReadyConnections: cursorReady,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof EmailDashboardAccessError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: "Email Inbox health could not be loaded." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
