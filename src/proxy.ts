import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next 16 renamed `middleware.ts` to `proxy.ts`. Two jobs here:
 *
 *   1. Refresh the Supabase session on every request. Server Components can't
 *      write cookies, so this is the only place rotated tokens can be handed
 *      back to the browser.
 *   2. Bounce signed-out visitors to /login.
 *
 * Job 2 is CONVENIENCE, NOT SECURITY. The Next docs are explicit that proxy is
 * not an authorization boundary — it can run on prefetches, it may be deployed
 * to a CDN, and Server Actions are POSTs to the page route, so a matcher that
 * skips a path also skips its actions. Real enforcement lives in two places
 * that cannot be bypassed: `requireUser()` inside every page, action and route
 * handler, and RLS in the database underneath all of it.
 */

const PUBLIC_PATHS = [
  "/login",
  "/auth/callback",
  "/auth/auth-error",
  "/auth/signout",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * A fresh NextResponse drops any cookies staged on an earlier one, so the
 * refreshed session has to be carried across by hand. Missing this is why
 * people end up in redirect loops.
 */
function carryCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
  return to;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalidates the JWT with the auth server. getSession() only
  // decodes whatever the cookie claims, which a client can forge — never use
  // it to make an access decision.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return carryCookies(
        response,
        NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
      );
    }

    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.search = "";
    if (pathname !== "/") target.searchParams.set("next", pathname);
    return carryCookies(response, NextResponse.redirect(target));
  }

  if (user && pathname === "/login") {
    const target = request.nextUrl.clone();
    target.pathname = "/tasks";
    target.search = "";
    return carryCookies(response, NextResponse.redirect(target));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets. Note the negative lookahead also has to
     * cover image files in /public, or the furnace sprites get run through auth
     * on every page load.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
