import { NextRequest, NextResponse } from "next/server";

function unauthorized(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Oturum süresi doldu." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

async function refreshSession(refreshToken: string) {
  try {
    const res = await fetch(
      `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.SUPABASE_ANON_KEY ?? "",
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.access_token || !data.refresh_token) return null;
    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token as string,
      expiresIn: data.expires_in as number,
    };
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/gmail/watch") ||
    pathname.startsWith("/api/webhooks/gmail") ||
    pathname.startsWith("/api/webhooks/meeting-baas") ||
    pathname.startsWith("/api/webhooks/calendar") ||
    pathname.startsWith("/api/calendar/watch") ||
    pathname.startsWith("/api/meetings/scan") ||
    pathname.startsWith("/api/meetings/dispatch")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("sb-access-token")?.value;

  if (token) {
    try {
      const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: process.env.SUPABASE_ANON_KEY ?? "",
        },
      });
      if (res.ok) {
        return NextResponse.next();
      }
    } catch {
      // Supabase'e ulaşılamadı, aşağıdaki refresh akışına düşülüyor.
    }
  }

  const refreshToken = req.cookies.get("sb-refresh-token")?.value;
  if (refreshToken) {
    const refreshed = await refreshSession(refreshToken);
    if (refreshed) {
      const response = NextResponse.next();
      response.cookies.set("sb-access-token", refreshed.accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: refreshed.expiresIn,
      });
      response.cookies.set("sb-refresh-token", refreshed.refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
      return response;
    }
  }

  return unauthorized(req);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
