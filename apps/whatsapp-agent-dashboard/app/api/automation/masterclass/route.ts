import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../lib/auth/session";
import {
  effectiveMessage2ImageAssetId,
  ensureMasterclassImageTemplates,
  getMasterclassImageOverview,
  saveMasterclassImageConfig,
  submitMasterclassImageTemplates,
} from "../../../../lib/automation/masterclass-image-flow";
import {
  dispatchDueMasterclassFollowUps,
  ensureMasterclassTemplates,
  getMasterclassFlowOverview,
  saveMasterclassFlowConfig,
  submitMasterclassTemplates,
  syncMasterclassTemplates,
} from "../../../../lib/automation/masterclass-registration-flow";
import { dispatchQueuedOutboundBatch } from "../../../../lib/outbound/outbound-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
]);

async function authorizedUser() {
  const user = await getCurrentDashboardUser();
  if (!user) {
    return {
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
      user: null,
    };
  }
  if (!ALLOWED_ROLES.has(user.role)) {
    return {
      response: NextResponse.json(
        { error: "Insufficient permission." },
        { status: 403 },
      ),
      user: null,
    };
  }
  return { response: null, user };
}

function automationActionsEnabled(): boolean {
  return process.env.AUTOMATION_ACTIONS_ENABLED?.trim().toLowerCase() === "true";
}

function applyAgentRuntime(config: {
  classTime: string;
  classDate: string;
  classDay: string;
  communityLink: string;
}): void {
  process.env.MASTERCLASS_NAME = "Free AI Expert Masterclass";
  process.env.MASTERCLASS_DATE_LABEL = `${config.classDay}, ${config.classDate}`;
  process.env.MASTERCLASS_TIME_LABEL = config.classTime;
  process.env.MASTERCLASS_COMMUNITY_URL = config.communityLink;
}

function candidateAssetId(value: unknown, current: string | null): string | null {
  if (value === undefined) return current;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function assertCandidateImageTemplatesReady(
  payload: Record<string, unknown>,
): Promise<void> {
  const overview = await getMasterclassImageOverview();
  const candidate = {
    message1ImageAssetId: candidateAssetId(
      payload.message1ImageAssetId,
      overview.config.message1ImageAssetId,
    ),
    useSameImageForMessage2:
      payload.useSameImageForMessage2 === undefined
        ? overview.config.useSameImageForMessage2
        : payload.useSameImageForMessage2 === true,
    message2ImageAssetId: candidateAssetId(
      payload.message2ImageAssetId,
      overview.config.message2ImageAssetId,
    ),
  };

  if (
    candidate.message1ImageAssetId &&
    overview.templates.instant?.status !== "APPROVED"
  ) {
    throw new Error(
      "Message 1 image template must be APPROVED before enabling the flow.",
    );
  }
  if (
    effectiveMessage2ImageAssetId(candidate) &&
    overview.templates.reminder?.status !== "APPROVED"
  ) {
    throw new Error(
      "Message 2 image template must be APPROVED before enabling the flow.",
    );
  }
}

async function combinedOverview() {
  const [base, imageFlow] = await Promise.all([
    getMasterclassFlowOverview(),
    getMasterclassImageOverview(),
  ]);
  return { ...base, imageFlow };
}

export async function GET() {
  const auth = await authorizedUser();
  if (auth.response) return auth.response;
  return NextResponse.json(await combinedOverview(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PATCH(request: Request) {
  const auth = await authorizedUser();
  if (auth.response || !auth.user) return auth.response;

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    if (payload.enabled === true && !automationActionsEnabled()) {
      throw new Error(
        "AUTOMATION_ACTIONS_ENABLED must be true before this flow can be enabled.",
      );
    }
    if (payload.enabled === true) {
      await assertCandidateImageTemplatesReady(payload);
    }

    await saveMasterclassImageConfig({
      message1ImageAssetId: payload.message1ImageAssetId,
      useSameImageForMessage2: payload.useSameImageForMessage2,
      message2ImageAssetId: payload.message2ImageAssetId,
      actorId: auth.user.id,
    });

    const updated = await saveMasterclassFlowConfig({
      enabled: payload.enabled,
      classTime: payload.classTime,
      classDate: payload.classDate,
      classDay: payload.classDay,
      communityLink: payload.communityLink,
      delayMinutes: payload.delayMinutes,
      actorId: auth.user.id,
    });
    applyAgentRuntime(updated);
    return NextResponse.json(await combinedOverview(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Masterclass flow configuration could not be saved.",
      },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await authorizedUser();
  if (auth.response || !auth.user) return auth.response;

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const action =
      typeof payload.action === "string"
        ? payload.action.trim().toLowerCase()
        : "";

    if (
      (action === "prepare_templates" ||
        action === "submit_templates" ||
        action === "dispatch_due") &&
      !automationActionsEnabled()
    ) {
      throw new Error(
        "AUTOMATION_ACTIONS_ENABLED must be true for external automation actions.",
      );
    }

    let result: unknown;
    if (action === "prepare_templates") {
      const [textTemplates, imageTemplates] = await Promise.all([
        ensureMasterclassTemplates(auth.user.id),
        ensureMasterclassImageTemplates(auth.user.id),
      ]);
      result = { textTemplates, imageTemplates };
    } else if (action === "submit_templates") {
      const [textTemplates, imageTemplates] = await Promise.all([
        submitMasterclassTemplates(auth.user.id),
        submitMasterclassImageTemplates(auth.user.id),
      ]);
      result = { textTemplates, imageTemplates };
    } else if (action === "sync_templates") {
      result = await syncMasterclassTemplates(auth.user.id);
    } else if (action === "dispatch_due") {
      const reminders = await dispatchDueMasterclassFollowUps({
        actorId: auth.user.id,
        limit: 100,
      });
      const outbound = await dispatchQueuedOutboundBatch(50);
      result = { reminders, outbound };
    } else {
      return NextResponse.json(
        { error: "Unsupported masterclass automation action." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { result, overview: await combinedOverview() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Masterclass automation action failed.",
      },
      { status: 400 },
    );
  }
}
