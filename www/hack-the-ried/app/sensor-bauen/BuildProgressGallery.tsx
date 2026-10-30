import Image from "next/image";

const buildPhotos = [
  {
    src: "/sensor-bauen/werkbank-und-bauteile-aufgeraeumt.webp",
    alt: "Aufgeräumte Werkbank mit Elektronikwerkzeug, Sensormodulen und RAK3112-Board",
    caption: "Der erste Aufbau: Bauteile sichten und den Arbeitsplatz vorbereiten.",
    width: 1086,
    height: 1448,
  },
  {
    src: "/sensor-bauen/sensoren-und-rak3112.webp",
    alt: "RAK3112-Board und mehrere Umweltsensor-Module mit handschriftlichen Bezeichnungen",
    caption: "Die Sensorauswahl für den aktuellen RAK3112-Aufbau.",
  },
  {
    src: "/sensor-bauen/rak3112-detail.webp",
    alt: "Detailaufnahme des RAK3112-Boards mit USB-C-Anschluss und Antennenanschlüssen",
    caption: "Das RAK3112 auf dem RAK3212-Board als Steuerung und LoRaWAN-Funkmodul.",
  },
  {
    src: "/sensor-bauen/rak3112-antennenaufbau.webp",
    alt: "RAK3112-Board mit dünnen Antennenkabeln und Koaxanschlüssen beim Aufbau",
    caption: "Antennenkabel und Anschlüsse während des Hardwareaufbaus.",
  },
  {
    src: "/sensor-bauen/sgp41-sensorplatine.webp",
    alt: "Kleine violette SGP41-Sensorplatine neben einer Stiftleiste",
    caption: "SGP41-Modul für VOC- und NOx-Indexwerte.",
  },
  {
    src: "/sensor-bauen/sps30-feinstaubsensor.webp",
    alt: "Sensirion SPS30-Feinstaubsensor mit angeschlossenem Kabel",
    caption: "Der SPS30 erfasst Partikelmasse, Partikelanzahl und typische Partikelgröße.",
  },
  {
    src: "/sensor-bauen/rak2287-gateway.webp",
    alt: "RAK2287 LoRa-Konzentrator-Modul mit angeschlossener Antenne",
    caption: "Das RAK2287 bildet die Funkseite des neuen LoRaWAN-Gateways.",
  },
  {
    src: "/sensor-bauen/3d-drucker.webp",
    alt: "3D-Drucker mit roter Filamentrolle und gedruckten Druckerteilen",
    caption: "Der 3D-Drucker für die kommenden Gehäuse- und Halterungsteile.",
  },
  {
    src: "/sensor-bauen/gehaeuse-cad-innenleben.webp",
    alt: "CAD-Ansicht des geöffneten Sensorgehäuses mit eingezeichneten Sensoren, RAK-Board und Luftführung",
    caption: "Im CAD-Entwurf werden Sensoren, Elektronik und Luftführung im Gehäuse angeordnet.",
    width: 1440,
    height: 900,
  },
  {
    src: "/sensor-bauen/gehaeuse-cad-gesamtansicht.webp",
    alt: "CAD-Entwurf des Sensorgehäuses mit langem Luftkanal für den Partikelsensor",
    caption: "Die Gesamtansicht zeigt den geplanten langen Ansaugkanal des SPS30-Gehäuses.",
    width: 1440,
    height: 900,
  },
  {
    src: "/sensor-bauen/gehaeuse-petg-druckvorschau.webp",
    alt: "Slicer-Vorschau des Gehäusebodens für den 3D-Druck aus PETG",
    caption: "Druckvorschau für den Gehäuseboden: PETG, rund 4 Stunden 41 Minuten geschätzte Druckzeit.",
    width: 1440,
    height: 900,
  },
];

export default function BuildProgressGallery() {
  return (
    <section id="baufortschritt" className="space-y-6" aria-labelledby="baufortschritt-titel">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
          Einblicke in den Aufbau
        </p>
        <h2 id="baufortschritt-titel" className="text-2xl font-bold text-slate-100 sm:text-3xl">
          Sensor und Gateway entstehen
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-300">
          Hier dokumentieren wir den aktuellen Stand: von den einzelnen Sensormodulen über den
          RAK3112-Sensorknoten bis zum neuen Gateway mit RAK2287. Gehäuse und Außeneinsatz sind
          noch weitere Bauschritte.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {buildPhotos.map((photo) => (
          <figure
            key={photo.src}
            className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900"
          >
            <Image
              src={photo.src}
              alt={photo.alt}
              width={photo.width ?? 1350}
              height={photo.height ?? 1800}
              sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 25vw"
              className="h-auto w-full"
            />
            <figcaption className="p-4 text-xs leading-relaxed text-slate-300">
              {photo.caption}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
