import { getPendingMessages } from "@/lib/data";
import { verifySession } from "@/lib/dal";
import { PendingList } from "./PendingList";

export async function PendingSection() {
  const userId = await verifySession();
  const pending = await getPendingMessages(userId);
  return <PendingList initialMessages={pending} />;
}
