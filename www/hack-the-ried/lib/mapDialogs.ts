import type L from "leaflet";

// Keep open overlays intact on polling/freshness ticks. Leaflet otherwise removes
// and re-inserts their DOM, losing selection and restarting layout/auto-pan.
export function updateMarkerDialogs(marker: L.Marker, popup: HTMLElement, tooltip: HTMLElement, popupOptions: L.PopupOptions = { maxWidth: 280 }) {
  const currentPopup = marker.getPopup();
  // Following a moving marker must not restart map panning on every frame.
  if (!currentPopup) marker.bindPopup(popup, { ...popupOptions, autoPan: false });
  else if (!sameContent(currentPopup.getContent(), popup)) marker.setPopupContent(popup);
  const currentTooltip = marker.getTooltip();
  if (!currentTooltip) marker.bindTooltip(tooltip, { direction: "top", offset: [0, -22] });
  else if (!sameContent(currentTooltip.getContent(), tooltip)) marker.setTooltipContent(tooltip);
}

function sameContent(current: unknown, next: HTMLElement): boolean {
  return current instanceof HTMLElement && current.isEqualNode(next);
}
