import { isAuthenticated } from "@/lib/adminAuth";
import { BackendError, listAdminSensors } from "@/lib/backend";
import AdminClientGate from "./AdminClientGate";

export const dynamic = "force-dynamic";

async function loadInitialSensors() {
  try {
    return { sensors: await listAdminSensors(), error: undefined };
  } catch (error) {
    console.error("Unable to load admin sensors:", error);
    return {
      sensors: [],
      error:
        error instanceof BackendError
          ? "Das Telemetrie-Backend ist derzeit nicht verfügbar."
          : "Die Sensorliste konnte nicht geladen werden.",
    };
  }
}

export default async function AdminPage() {
  const authenticated = await isAuthenticated();
  if (!authenticated)
    return <AdminClientGate initialAuthenticated={false} initialSensors={[]} />;
  const initial = await loadInitialSensors();
  return (
    <AdminClientGate
      initialAuthenticated
      initialSensors={initial.sensors}
      initialError={initial.error}
    />
  );
}
