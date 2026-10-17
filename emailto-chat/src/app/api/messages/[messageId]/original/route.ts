import { getOriginal } from "@/server/domain/actions";
import { gmailFor } from "@/server/http";
import { gmailIdSchema } from "@/server/schemas";
import { apiHandler } from "@/server/security/api";

/** "Show original": raw RFC 822 source as inert plain text. */
export const GET = apiHandler<undefined, undefined, { messageId: string }>({}, async ({ account, params }) => {
  const raw = await getOriginal(gmailFor(account), gmailIdSchema.parse(params.messageId));
  return new Response(raw, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "private, no-store",
    },
  });
});
