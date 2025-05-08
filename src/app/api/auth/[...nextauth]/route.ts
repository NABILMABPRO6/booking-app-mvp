// src/app/api/auth/[...nextauth]/route.ts

// Re-export the route handlers from our main auth configuration
// This single file handles all GET and POST requests to /api/auth/*
export { GET, POST } from '@/lib/auth';

// Optional: If you need to handle other HTTP methods for the /api/auth endpoint,
// you can define them here, but GET and POST are the primary ones used by NextAuth.
// export async function PUT(request: Request) { ... }
// export async function DELETE(request: Request) { ... }

// By default, NextAuth handles most methods. If you have specific logic
// for other methods under /api/auth, you'd add it here. Otherwise,
// exporting GET and POST is sufficient.