import OfficialStatisticsPage from "../components/OfficialStatisticsPage";
export const dynamic = "error";
export default function ElectionsPage() {
  return <OfficialStatisticsPage domain="elections" title="Wahlergebnisse" />;
}
