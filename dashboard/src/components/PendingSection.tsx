import { getPendingMessages } from "@/lib/data";
import { PendingList } from "./PendingList";

export async function PendingSection() {
  const pending = await getPendingMessages();
  return <PendingList initialMessages={pending} />;
}
