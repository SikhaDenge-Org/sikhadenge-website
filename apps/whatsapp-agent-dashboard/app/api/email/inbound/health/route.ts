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

export async function GET() {
  try {
    const access = await requireEmailManagerAccess();
    const connections = await prisma.engageChannelConnection.findMany({
      where: {
        workspaceId: access.workspaceId,
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

    const runtime = buildEmailE1Runtime();
    const adapter = runtime.providers.get("GOOGLE_GMAIL");
    let readAccess = false;
    let statusCode = 0;
    let probeError = "";
    let authorizedConnectionId: string | null = null;

    if (adapter instanceof GmailEmailProviderAdapter) {
      for (const connection of gmail) {
        try {
          const token = await adapter.getAccessTokenForConnection(
            access.workspaceId,
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
            probeError = "";
            break;
          }
          probeError = `Gmail profile probe returned HTTP ${response.status}`;
        } catch (error) {
          probeError = error instanceof Error
            ? error.message
            : "Gmail Inbox access probe failed.";
        }
      }
    } else {
      probeError = "Gmail provider is unavailable.";
    }

    const cursorReady = gmail.filter((row) => {
      const state = inboundState(row.capabilities);
      return typeof state.historyId === "string" && state.historyId.trim().length > 0;
    }).length;

    return NextResponse.json(
      {
        gmailConnected: gmail.length > 0,
        connectedGmailConnections: gmail.length,
        readAccess,
        readAccessStatus: readAccess ? "AUTHORIZED" : "NEEDS_AUTHORIZATION",
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
