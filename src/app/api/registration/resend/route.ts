import { createResendHandler } from "@/lib/onboarding/handler";

const handle = createResendHandler();

export async function POST(request: Request) {
  return handle(request);
}
