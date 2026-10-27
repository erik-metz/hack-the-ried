export interface RegularOffer {
  id: string;
  title: string;
  organizer: string;
  municipality: string;
  weekday: string;
  start_local: string;
  end_local?: string;
  timezone: string;
  venue_name: string;
  description: string;
  source: string;
  source_url: string;
}
