# Rail Log

Eine webbasierte Anwendung für Logistikmanagement im Bahnbau. Das Projekt visualisiert den Standort und die Bewegung von Waggons in "Logistikknoten" auf einer Zeitachse – als interaktive Darstellung mit Planungs- und Kontrollfunktionen.

## Funktionen

- Visualisierung von Gleisen und Waggons auf einer interaktiven Zeitachse
- Verwaltung von Logistikknoten, Gleisen und Waggons
- Planung und Kontrolle von Transportbewegungen (Trips)
- Verwaltung von Restriktionen für Ein- und Ausfahrten
- Export von Planungs- und Echtdaten

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