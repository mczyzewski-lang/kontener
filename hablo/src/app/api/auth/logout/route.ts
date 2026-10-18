import { NextResponse } from "next/server";
import { appMode } from "@/lib/env";
import { createUserClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  if (appMode() === "supabase") await (await createUserClient()).auth.signOut();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
