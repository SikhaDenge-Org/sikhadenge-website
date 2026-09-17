import { NextResponse } from "next/server";

import { replaceConversationTags } from "../../../../../lib/operations/conversation-operations";
import {
  operationErrorResponse,
  operationRequestContext,
  requireOperationsUser,
} from "../../../../../lib/operations/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: { conversationId: string } },
) {
  const auth = await requireOperationsUser();
  if (auth.error) return auth.error;

  let payload: { tags?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (!Array.isArray(payload.tags)) {
    return NextResponse.json({ error: "tags must be an array." }, { status: 400 });
  }

  const tags = payload.tags.flatMap((item) => {
    if (typeof item === "string") return [{ name: item, color: null }];
    if (
      typeof item === "object" &&
      item !== null &&
      "name" in item &&
      typeof item.name === "string"
    ) {
      return [
        {
          name: item.name,
          color:
            "color" in item && typeof item.color === "string"
              ? item.color
              : null,
        },
      ];
    }
    return [];
  });

  if (tags.length !== payload.tags.length) {
    return NextResponse.json({ error: "One or more tags are invalid." }, { status: 400 });
  }

  try {
    const updatedTags = await replaceConversationTags({
      conversationId: context.params.conversationId,
      tags,
      actor: { id: auth.user.id, role: auth.user.role },
      context: operationRequestContext(request),
    });
    return NextResponse.json(
      { tags: updatedTags, outboundSent: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return operationErrorResponse(error);
  }
}
