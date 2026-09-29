import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

function redirectWithSessionCookies(request: NextRequest, response: NextResponse) {
  const redirect = NextResponse.redirect(new URL("/login", request.url));

  response.cookies.getAll().forEach(({ name, value, ...options }) => {
    redirect.cookies.set(name, value, options);
  });

  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = response.headers.get(header);
    if (value) redirect.headers.set(header, value);
  }

  return redirect;
}

export async function proxy(request: NextRequest) {
  const { isAuthenticated, response } = await updateSession(request);

  if (!isAuthenticated) {
    return redirectWithSessionCookies(request, response);
  }

  return response;
}

export const config = {
  matcher: ["/", "/watches/:path*"],
};
