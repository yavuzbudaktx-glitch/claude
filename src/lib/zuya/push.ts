// Zuya's push sender. The implementation is shared with Rest Area — see
// src/lib/push.ts — because a browser has one push subscription per service
// worker, so both features are talking to the same device registry.
export { pushToUser, pushConfigured, PUSH_SUBS_TABLE, type PushPayload } from "@/lib/push";
