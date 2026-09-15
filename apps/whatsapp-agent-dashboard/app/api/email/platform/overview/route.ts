import { NextResponse } from "next/server";
import { requireEmailManagerAccess, EmailDashboardAccessError } from "@/modules/email-automation/application/dashboard-access";
import { getEmailPlatformOverview } from "@/modules/email-automation/finalization/platform-service";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(){try{const access=await requireEmailManagerAccess();return NextResponse.json(await getEmailPlatformOverview(access.workspaceId),{headers:{"Cache-Control":"no-store"}});}catch(error){if(error instanceof EmailDashboardAccessError)return NextResponse.json({error:error.message,code:error.code},{status:error.status});return NextResponse.json({error:error instanceof Error?error.message:"Overview failed."},{status:400});}}