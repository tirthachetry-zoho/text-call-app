import { ChatList } from "@/components/chat/chat-list";
import { EmptyState } from "@/components/dashboard/empty-state";

export default function DashboardPage() {
  return (
    <div className="flex flex-1 overflow-hidden">
      <ChatList />
      <EmptyState />
    </div>
  );
}