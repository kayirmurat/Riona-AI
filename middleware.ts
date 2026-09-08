import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const expectedUser = "riona";
  const expectedPass = process.env.APP_PASSWORD ?? "";

  const auth = req.headers.get("authorization");

  if (auth && expectedPass) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      const [user, pass] = decoded.split(":");
      if (user === expectedUser && pass === expectedPass) {
        return NextResponse.next();
      }
    }
  }

  return new NextResponse("Yetkisiz erişim", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Riona AI"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
