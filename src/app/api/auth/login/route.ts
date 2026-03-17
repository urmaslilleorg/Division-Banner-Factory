export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { fetchUserByEmail, verifyPassword, updateUser } from "@/lib/users";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body as { email?: string; password?: string };

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Look up user by email
    const user = await fetchUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Check account status
    if (user.status === "Disabled") {
      return NextResponse.json(
        { error: "Account is disabled. Contact your administrator." },
        { status: 401 }
      );
    }

    // Verify password
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Create session
    const session = await getSession();
    session.userId = user.id;
    session.email = user.email;
    session.name = user.name;
    session.role = user.role;
    session.clientId = user.clientId;
    session.clientName = user.clientName;
    await session.save();

    // Update last login timestamp (fire and forget)
    updateUser(user.id, { lastLogin: new Date().toISOString() }).catch(
      (err) => console.error("Failed to update last login:", err)
    );

    // If must change password, signal the client
    if (user.mustChangePassword) {
      return NextResponse.json({ mustChangePassword: true });
    }

    return NextResponse.json({
      success: true,
      role: user.role,
      clientId: user.clientId,
    });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
