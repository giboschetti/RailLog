import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  
  // Get session
  const { data: { session } } = await supabase.auth.getSession();

  // Public routes that don't require authentication
  const publicPaths = ['/login', '/'];
  const isPublicPath = publicPaths.some(path => req.nextUrl.pathname === path);
  
  // Static assets and API routes shouldn't be checked
  const isStaticOrApi = req.nextUrl.pathname.startsWith('/_next') || 
                        req.nextUrl.pathname.startsWith('/api') ||
                        req.nextUrl.pathname.includes('favicon.ico');
  
  // Only redirect if the user is not authenticated and trying to access a protected route
  if (!session && !isPublicPath && !isStaticOrApi) {
    // Use 307 Temporary Redirect to preserve the request method
    return NextResponse.redirect(new URL('/login', req.url));
  }
  
  // If the user is authenticated and trying to access login page, redirect to home
  if (session && req.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/', req.url));
  }
  
  // Add session user to response headers for use in server components
  if (session) {
    res.headers.set('x-user-id', session.user.id);
    res.headers.set('x-user-email', session.user.email || '');
  }
  
  return res;
}

// Specify which routes the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}; 