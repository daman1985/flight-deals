import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

function redirectsToLogin(request: NextRequest, error: "credentials" | "service") {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return new NextResponse(null, { status: 403 });
  }

  const formData = await request.formData();
  const credentials = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!credentials.success) {
    return redirectsToLogin(request, "credentials");
  }

  const supabase = await createClient();

  try {
    const { error } = await supabase.auth.signInWithPassword(credentials.data);
    if (error) return redirectsToLogin(request, "credentials");
  } catch {
    return redirectsToLogin(request, "service");
  }

  return NextResponse.redirect(new URL("/", request.url), 303);
}
