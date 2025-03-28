# Rail Log Setup Instructions

## Übersicht

Dieses Dokument enthält Anweisungen zum Einrichten der Rail Log-Anwendung mit Supabase als Backend-Service.

## 1. Supabase Konfiguration

### 1.1 Supabase Projekt erstellen

1. Erstellen Sie ein Konto bei [Supabase](https://supabase.com/) falls noch nicht vorhanden
2. Erstellen Sie ein neues Projekt namens "rail-log"
3. Notieren Sie sich die Projekt-URL und den anonymen Schlüssel

### 1.2 Datenbank-Schema einrichten

1. Navigieren Sie in Ihrem Supabase-Projekt zum SQL-Editor
2. Kopieren Sie den Inhalt der Datei `supabase/schema.sql` aus diesem Projekt
3. Führen Sie das SQL-Skript aus, um alle benötigten Tabellen, Funktionen und Richtlinien zu erstellen

### 1.3 Authentifizierung konfigurieren

1. In Ihrem Supabase-Projekt, navigieren Sie zu "Authentication" > "Settings"
2. Aktivieren Sie den Email-Provider für die Authentifizierung
3. Optional: Konfigurieren Sie die Email-Vorlagen für Anmeldung und Passwort-Zurücksetzung

## 2. Lokale Entwicklungsumgebung

### 2.1 Umgebungsvariablen einrichten

1. Kopieren Sie die Datei `.env.example` zu `.env.local`
2. Tragen Sie Ihre Supabase-URL und den anonymen Schlüssel ein:

```
NEXT_PUBLIC_SUPABASE_URL=https://ihre-projekt-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ihr-anonymer-schlüssel
```

### 2.2 Abhängigkeiten installieren

Führen Sie den folgenden Befehl aus, um alle erforderlichen Pakete zu installieren:

```
npm install
```

### 2.3 Entwicklungsserver starten

Starten Sie den Entwicklungsserver mit:

```
npm run dev
```

Die Anwendung ist dann unter [http://localhost:3000](http://localhost:3000) verfügbar.

## 3. Erste Schritte mit der Anwendung

### 3.1 Erstellen eines Admin-Benutzers

1. Navigieren Sie zu http://localhost:3000/login
2. Registrieren Sie einen neuen Benutzer
3. In Ihrem Supabase-Dashboard, gehen Sie zu "Table Editor" > "users"
4. Bearbeiten Sie den neu erstellten Benutzer und ändern Sie die Rolle von "viewer" zu "admin"

### 3.2 Daten erstellen

Als Admin-Benutzer können Sie nun:

1. Projekte anlegen
2. Logistikknoten (Baustellen, Stationen) erstellen
3. Gleise zu den Knoten hinzufügen
4. Waggons und Transportbewegungen definieren
5. Restriktionen für Ein- und Ausfahrten festlegen

## 4. Deployment

### 4.1 Vercel Deployment

Für ein einfaches Deployment können Sie die Anwendung auf Vercel hosten:

1. Erstellen Sie ein Konto bei [Vercel](https://vercel.com/)
2. Verbinden Sie Ihr GitHub-Repository
3. Konfigurieren Sie die Umgebungsvariablen für Supabase
4. Deployen Sie die Anwendung

## 5. Fehlerbehebung

- **Authentifizierungsprobleme**: Überprüfen Sie die Supabase-URL und den anonymen Schlüssel
- **Datenbankfehler**: Prüfen Sie, ob das SQL-Schema korrekt ausgeführt wurde
- **Berechtigungsprobleme**: Stellen Sie sicher, dass die Benutzerrolle korrekt gesetzt ist

Bei weiteren Problemen prüfen Sie die Supabase- und Next.js-Dokumentation oder erstellen Sie ein Issue im Projektrepository. 