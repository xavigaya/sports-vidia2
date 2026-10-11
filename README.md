# Sports VidIA 2

Aplicació per generar estadístiques de partits de voleibol a partir de vídeo (local o de YouTube), amb codificació compatible amb DataVolley / Click&Scout. Funcionarà al navegador, en tauletes Android i com a aplicació d'escriptori de Windows i Linux.

## Estat

**Fase 1 — Fonaments** (aquesta versió)

- Comptes d'usuari (correu i contrasenya).
- Diversos clubs amb les dades completament separades.
- Rols per club: *Administrador*, *Analista* i *Consulta*.
- Configuració del club: nom, colors (s'apliquen a tota la interfície), logotip, idioma per defecte i regles (canvis i temps morts per set; per defecte, RFEVB).
- Invitació d'usuaris per correu.
- Temporades, equips propis i rivals, jugadors i plantilles (dorsal, posició, capità, actiu).
- Interfície en català, castellà i anglès.

**Fase 2 — Motor de partit**

- Creació de partits (local, visitant, data, competició, jornada, pavelló, al millor de 3 o 5 sets).
- Convocatòria a partir de les plantilles, amb dorsals i líberos.
- Alineació inicial de cada set (posicions I–VI) i primer servei.
- Marcador automàtic: rotació en recuperar el servei, final de set (25 / 15 al set decisiu, amb 2 punts de diferència) i final de partit.
- Canvis amb les regles reglamentàries (titular ↔ suplent, límit per set configurable; RFEVB: 8).
- Líberos: entrada només per la zaga, no poden servir, sortida automàtica quan arribarien a la davantera, canvi entre líberos.
- Temps morts amb límit per set.
- Pantalla tàctil amb botons grans, i línia d'ordres per teclat amb codis DataVolley (`*p`, `ap`, `*T`, `*c3:13`…).
- Desfer (Ctrl+Z), registre d'accions i seguiment en directe des d'altres dispositius.
- Un sol codificador per partit; la resta del club el pot seguir en directe.

**Properes fases**: codificació de les accions de joc (servei, recepció, col·locació, atac, bloqueig, free ball) amb qualitat, zones i trajectòries; vídeo sincronitzat; estadístiques; importació/exportació DataVolley i Excel; funcionament sense connexió; versions d'escriptori i Android.

## Tecnologia

- React + TypeScript + Vite (una sola base de codi per a totes les plataformes).
- Supabase (PostgreSQL, usuaris, emmagatzematge) amb seguretat a nivell de fila per aïllar cada club.
- Més endavant: Tauri (Windows/Linux) i Capacitor (Android).

## Posada en marxa

### 1. Crear el projecte Supabase

1. Crea un compte a [supabase.com](https://supabase.com) i un projecte nou. **Tria una regió de la UE** (p. ex. *Frankfurt* o *Ireland*): hi haurà dades de menors i convé que no surtin de la UE.
2. Al panell, ves a **SQL Editor** i executa, **en ordre**, cada fitxer de `supabase/migrations/` (`0001_init.sql`, `0002_matches.sql`…). Cada fitxer només s'executa una vegada.
3. A **Authentication → Sign In / Providers**, comprova que *Email* està activat.
4. A **Authentication → URL Configuration**, posa `http://localhost:5173` com a *Site URL* mentre desenvolupes.
5. Amb el botó **Connect** (a dalt del tauler) o a **Project Settings → API Keys**, copia l'URL del projecte i la clau *publishable* (`sb_publishable_…`).

### 2. Arrencar l'aplicació

Cal tenir [Node.js](https://nodejs.org) 20 o superior.

```bash
git clone https://github.com/xavigaya/sports-vidia2.git
cd sports-vidia2
cp .env.example .env      # a Windows (PowerShell): Copy-Item .env.example .env
                          # i omple-hi l'URL i la clau de Supabase
npm install
npm run dev
```

Obre http://localhost:5173, crea un compte, confirma el correu i crea el teu club.

### 3. Actualitzar a una versió nova

```bash
git pull
npm install
```

Si la versió nova porta un fitxer nou a `supabase/migrations/`, executa'l a l'SQL Editor de Supabase.

## Protecció de dades

Dels jugadors només es guarda el que cal per a l'estadística: nom, cognoms, àlies opcional, dorsal i posició. No es desa ni data de naixement, ni dades de contacte, ni fotos. Cada jugador té dues marques:

- **Menor d'edat**.
- **Consentiment d'imatge**: caldrà per pujar a YouTube vídeos on aparegui. En menors, l'han de donar els tutors legals.

Cada club és responsable de recollir aquests consentiments i de complir el RGPD.

## Estructura

```
supabase/migrations/   Esquema de la base de dades i polítiques de seguretat
src/auth/              Inici de sessió
src/club/              Club actual, selecció, configuració i usuaris
src/teams/             Equips i plantilles
src/players/           Jugadors
src/engine/            Motor de partit (regles, rotacions, marcador) i codis
src/matches/           Partits, convocatòria i marcador en directe
src/i18n/              Traduccions (ca.json és la referència)
```
