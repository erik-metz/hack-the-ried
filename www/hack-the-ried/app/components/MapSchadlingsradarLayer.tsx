"use client";

import L from "leaflet";
import { useEffect } from "react";
import { detailCard } from "@/lib/mapPresentation";

const POSTCODES = [
  { name: "Lampertheim", postcode: "68623", position: [49.597, 8.472] as L.LatLngExpression },
  { name: "Bürstadt", postcode: "68642", position: [49.643, 8.452] as L.LatLngExpression },
  { name: "Biblis", postcode: "68647", position: [49.691, 8.458] as L.LatLngExpression },
  { name: "Groß-Rohrheim", postcode: "68649", position: [49.719, 8.483] as L.LatLngExpression },
];

export default function MapSchadlingsradarLayer({ map }: { map: L.Map }) {
  useEffect(() => {
    const paneName = "schadlingsradar";
    const pane = map.getPane(paneName) ?? map.createPane(paneName);
    pane.style.zIndex = "456";
    const markers = L.layerGroup(POSTCODES.map(({ name, postcode, position }) => {
      const marker = L.circleMarker(position, {
        pane: paneName,
        radius: 9,
        color: "#fff",
        weight: 2,
        fillColor: "#84cc16",
        fillOpacity: 0.95,
      });
      const card = detailCard(`Schädlingsmeldungen · ${name}`, "Schädlingsradar · PLZ-Gebiet", ["Gebietsmarker, kein konkreter Fundort"]);
      const link = document.createElement("a");
      link.href = `https://www.schaedlingsradar.de/lage/${postcode}/`;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = `Meldungen für ${postcode} auf Schädlingsradar öffnen`;
      card.append(link);
      marker.bindPopup(card, { maxWidth: 320 });
      marker.bindTooltip(`${name} · ${postcode}`, { direction: "top", offset: [0, -8] });
      return marker;
    })).addTo(map);
    const attribution = '<a href="https://www.schaedlingsradar.de/lage/" target="_blank" rel="noreferrer">Schädlingsradar · öffentliche PLZ-Lagen</a>';
    map.attributionControl?.addAttribution(attribution);
    return () => {
      markers.remove();
      map.attributionControl?.removeAttribution(attribution);
    };
  }, [map]);

  return null;
}
