import { NextRequest, NextResponse } from "next/server";
import { createUser, validateEmail, validatePassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, name } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (!validateEmail(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    const { valid, message } = validatePassword(password);
    if (!valid) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const user = await createUser(email, password, name);
    return NextResponse.json({ user }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Registration failed";
    const status = message === "Email already registered" ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
