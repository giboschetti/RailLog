# Rail Log

Eine webbasierte Anwendung für Logistikmanagement im Bahnbau. Das Projekt visualisiert den Standort und die Bewegung von Waggons in "Logistikknoten" auf einer Zeitachse – als interaktive Darstellung mit Planungs- und Kontrollfunktionen.

## Funktionen

- Visualisierung von Gleisen und Waggons auf einer interaktiven Zeitachse
- Verwaltung von Logistikknoten, Gleisen und Waggons
- Planung und Kontrolle von Transportbewegungen (Trips)
- Verwaltung von Restriktionen für Ein- und Ausfahrten
- Export von Planungs- und Echtdaten
- Zeitbasierte Kapazitätsplanung (neue Funktion)

## Technischer Stack

- **Frontend**: Next.js, React, TailwindCSS
- **Backend & Auth**: Supabase
- **Deployment**: Vercel
- **Visualisierung**: Konva.js oder SVG mit D3.js

## Entwicklung

### Installation

1. Abhängigkeiten installieren:
   ```
   npm install
   ```

2. Entwicklungsserver starten:
   ```
   npm run dev
   ```

3. Öffnen Sie [http://localhost:3000](http://localhost:3000) in Ihrem Browser.

### Build

```
npm run build
```

### Deployment

```
npm run start
```

## Projektstruktur

- `/src/app` - Next.js App Router Komponenten
- `/src/components` - Wiederverwendbare UI-Komponenten
- `/src/lib` - Hilfsfunktionen und Utility-Code
- `/public` - Statische Assets

## Lizenz

Dieses Projekt ist proprietär und für den internen Gebrauch bestimmt.

## Neueste Features

### Zeitbasierte Kapazitätsplanung

Die Anwendung wurde mit einer zeitbasierten Kapazitätsplanung erweitert:

- Prüfung von Gleiskapazität basierend auf geplanten Trips und Zeiten
- Konflikterkennung für überlappende Trips (2-Stunden-Fenster)
- Warnungen für mehrere Trips am selben Tag
- Verbessertes Tracking von Waggonverfügbarkeit

### Testseite für Zeitplanung

Eine neue Testseite wurde hinzugefügt, um die zeitbasierte Planung zu testen und zu demonstrieren.
Diese ist unter `/schedule-test` verfügbar.

## Wagon Visualization in Timeline

The timeline tracks show wagons based on their trip history, not based on the `current_track_id` field in the database. This ensures that:

1. Wagons only appear on a track after their delivery date/time
2. Wagon movement history is correctly preserved with "Erstplatzierung" (initial placement) and "Anlieferung" (delivery) events

### Implementation Details

- When a delivery trip is created, two events happen:
  - An "Erstplatzierung" record is created immediately at the current time
  - The actual delivery is scheduled for the user-selected date/time
  
- The timeline view (`TimelineTrack` component) will only show wagons that have trips with timestamps before or equal to the selected date/time.

- Each wagon's movement history is tracked in the `wagon_trajectories` table, which records:
  - When a wagon is first placed (Erstplatzierung)
  - When it is delivered (Anlieferung)
  - When it is moved between tracks (Interne Bewegung)
  - When it leaves the system (Abfahrt)

This approach ensures that the timeline view accurately reflects the state of the tracks at any given point in time. 