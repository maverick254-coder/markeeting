import { handleForumRequest } from "@/lib/community/api";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

const handle = async (request: Request, { params }: Context) => handleForumRequest(request, (await params).path);

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
