# Multiplikationstabellen, mycket lättare än den verkar!

En enkel och pedagogisk webbsida för att träna multiplikationstabellen, byggd
utifrån Snillsparvs film om hur man lär sig tabellen på ett smart sätt:
nästan allt går att räkna ut med enkla knep, det är bara sex tal som
verkligen behöver memoreras.

**Träna här: https://snillsparv.github.io/Multiplikation/**

Sidan funkar lika bra på mobil som på dator och kräver ingen inloggning.
All träningsdata sparas lokalt i webbläsaren (localStorage).

## Funktioner

- **Träna**, välj vilka tabeller du vill öva på (1 till 10), hur många frågor
  du vill ha, eller hoppa direkt på *De sex svåra* (6×6, 6×7, 6×8, 7×7, 7×8, 8×8).
- **Tabellen**, halva tabellen är utgråad, eftersom 6×4 är samma sak som
  4×6 (kommutativa lagen). Bocka av de tal du redan kan, så stryks de,
  kvar står det du behöver öva på, och det är bara de talen du får frågor
  om när du tränar.
- **Knepen**, alla tips från filmen: ettan, tian, femman, nian, tvåan,
  fyran och trean, plus minnesreglerna för de sex svåra. När du svarar fel
  eller långsamt i träningen dyker rätt knep upp direkt, anpassat till just
  det talet.
- **Statistik**, sidan mäter hur snabbt du svarar och håller koll på vad
  som går fel. Under *Mina luckor* kan du träna specifikt på de tal du är
  långsammast eller osäkrast på, och kartan visar hela tabellen i grönt,
  gult och rött. Bara de senaste svaren räknas, så gamla misstag förlåts
  när nya rätt kommer.
- Vid fel svar visas först bara knepet som ledtråd, utan facit, och man
  får en ny chans att komma på svaret själv. Först vid andra felet visas
  facit, tillsammans med en prickmodell som ritar talet som rader av
  prickar (färgdelat vid femman) så att man ser varför svaret stämmer.
- Tal som blir fel under en runda kommer tillbaka lite senare i samma
  runda och måste sitta två gånger i rad innan de släpps.
- Läxlänkar: `gångertabellen.se/#tabell=5,9&antal=10` startar en
  förinställd runda direkt, perfekt att skicka som läxa. En
  kopiera-knapp på startskärmen skapar länken åt dig. Även
  `#traning=sex-svara` och `#traning=luckor` fungerar.
- Filmen är inbäddad högst upp på startsidan och under Knepen (Vimeo,
  spårningsfritt läge med dnt=1, laddas först när man trycker play, och
  stoppas vid flikbyte så att ljudet aldrig fortsätter i bakgrunden). Varje knep-kort har en "Se knepet
  i filmen"-knapp som hoppar till rätt sekund; tiderna anges i
  `FILM_TIDER` i `app.js`.
- Smart repetition: tal som sitter "vilar" allt längre mellan gångerna
  (Leitner-lådor), och tre snabba rätt i rad bockar av talet automatiskt
  i tabellen. Tempogränserna anpassar sig efter användarens egen takt.
- Affischer till klassrumsväggen: `affischer.html` är en utskriftssida
  med alla knep som A4-blad (översikten, de åtta strategierna och de sex
  minnesreglerna med bilderna ur filmen), länkad från Knepen-fliken.
  `affischer.pdf` är samma paket som färdig PDF; generera om den ur
  sidan med Chromium/Playwright (`page.pdf({ format: "A4",
  printBackground: true, preferCSSPageSize: true })`) om arken ändras.
  Typsnitten ligger lokalt i `fonter/` så att sidan fungerar utan
  Google Fonts.

## Kör lokalt

Öppna `index.html` i en webbläsare, det är allt. Vill du köra via en lokal
server (t.ex. för att testa på mobilen i samma nätverk):

```bash
python3 -m http.server 8000
# öppna sedan http://localhost:8000
```

## Publicering

Sidan publiceras automatiskt till GitHub Pages vid varje push, via
arbetsflödet i `.github/workflows/pages.yml`.

## Teknik

Ren HTML, CSS och JavaScript, inga ramverk, inga beroenden, inget byggsteg.

- `index.html`, sidans struktur och texterna under *Knepen*
- `style.css`, utseende, färgkodning, mobilanpassning
- `app.js`, quizmotor, statistik, rutnät och dynamiska tips
