# Docentenplanner - Installatie

## Wat heb je nodig?

1. **Node.js** (versie 18 of hoger)
   - Download van: https://nodejs.org
   - Kies de "LTS" versie (aanbevolen)
   - Installeer met standaardinstellingen (gewoon steeds "Next" klikken)

## Installatie stappen

### Stap 1: Open een terminal
- **Windows**: Zoek naar "PowerShell" of "Command Prompt" in het startmenu
- **Mac**: Open "Terminal" (zit in Applications > Utilities)

### Stap 2: Ga naar de projectmap
Typ het pad naar waar je de `docentenplanner-app` map hebt neergezet. Bijvoorbeeld:

```
cd ~/Documents/docentenplanner-app
```

Of op Windows:
```
cd C:\Users\Peter\Documents\docentenplanner-app
```

### Stap 3: Installeer de afhankelijkheden
```
npm install
```
Dit duurt even (1-2 minuten). Je ziet wat tekst voorbijkomen, dat is normaal.

### Stap 4: Start de app
```
npm run dev
```

Je ziet dan zoiets als:
```
▲ Next.js 16.2.2
- Local: http://localhost:3000
```

### Stap 5: Open je browser
Ga naar: **http://localhost:3000**

Dat is het! Je docentenplanner draait nu op je computer.

## Dagelijks gebruik

Elke keer als je de planner wilt gebruiken:

1. Open een terminal
2. `cd` naar de projectmap
3. Typ `npm run dev`
4. Open http://localhost:3000 in je browser
5. Om te stoppen: druk `Ctrl + C` in de terminal

## Op het digibord

Open op het digibord gewoon Chrome/Edge en ga naar **http://localhost:3000**. De leerlingen zien dan de plattegrond, startopdracht en lesinfo.

## Problemen?

| Probleem | Oplossing |
|----------|-----------|
| "npm not found" | Node.js is nog niet geinstalleerd, zie stap 1 |
| "Port 3000 is in use" | Sluit de andere terminal die de app draait, of gebruik `npm run dev -- -p 3001` |
| Lege pagina | Wacht een paar seconden en refresh de pagina |
| Database kwijt | De database staat in de `data/` map. Verwijder `docentenplanner.db` om opnieuw te beginnen met demo-data |
