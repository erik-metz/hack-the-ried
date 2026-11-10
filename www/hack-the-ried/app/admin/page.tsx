import { isAuthenticated } from "@/lib/adminAuth";
import AdminClientGate from "./AdminClientGate";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  return <AdminClientGate initialAuthenticated={await isAuthenticated()} />;
}
