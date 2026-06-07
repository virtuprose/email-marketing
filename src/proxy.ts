import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_FILE = /\.(.*)$/;

export function proxy(request: NextRequest) {
  const username = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;

  if (!username || !password) {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/unsubscribe") ||
    pathname.startsWith("/api/track") ||
    pathname.startsWith("/api/inbound") ||
    pathname.startsWith("/api/webhooks/meta") ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get("authorization");
  const validHeader = `Basic ${btoa(`${username}:${password}`)}`;

  if (authHeader === validHeader) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Virtuprose Email Agent"'
    }
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
