import { createRegistrationHandler } from "@/lib/onboarding/handler";

// The pipeline lives in @/lib/onboarding/handler so tests can construct it with doubles.
const handle = createRegistrationHandler();

export async function POST(request: Request) {
  return handle(request);
}
