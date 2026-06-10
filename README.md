# ✖️ Multiplikationstabellen – mycket lättare än den verkar!

En enkel och pedagogisk webbsida för att träna multiplikationstabellen, byggd
utifrån Snillsparvs film om hur man lär sig tabellen på ett smart sätt:
nästan allt går att räkna ut med enkla knep – det är bara sex tal som
verkligen behöver memoreras.

**👉 Träna här: https://snillsparv.github.io/Multiplikation/**

Sidan funkar lika bra på mobil som på dator och kräver ingen inloggning.
All träningsdata sparas lokalt i webbläsaren (localStorage).

## Funktioner

- 🚀 **Träna** – välj vilka tabeller du vill öva på (1–10), hur många frågor
  du vill ha, eller hoppa direkt på *De sex svåra* (6×6, 6×7, 6×8, 7×7, 7×8, 8×8).
- ✅ **Tabellen** – bocka av de tal du redan kan. Tack vare kommutativa lagen
  bockas 6×4 av automatiskt när du bockar av 4×6.
- 💡 **Knepen** – alla tips från filmen: ettan, tian, femman, nian, tvåan,
  fyran och trean, plus minnesreglerna för de sex svåra. När du svarar fel
  eller långsamt i träningen dyker rätt knep upp direkt, anpassat till just
  det talet.
- 📊 **Statistik** – sidan mäter hur snabbt du svarar och håller koll på vad
  som går fel. Under *Mina luckor* kan du träna specifikt på de tal du är
  långsammast eller osäkrast på, och värmekartan visar hela tabellen i grönt,
  gult och rött.
- 🔁 Tal som blir fel under en runda kommer tillbaka lite senare i samma
  runda, så att de hinner fastna.

## Kör lokalt

Öppna `index.html` i en webbläsare – det är allt. Vill du köra via en lokal
server (t.ex. för att testa på mobilen i samma nätverk):

```bash
python3 -m http.server 8000
# öppna sedan http://localhost:8000
```

## Publicera på GitHub Pages

1. Gå till **Settings → Pages** i det här repot på GitHub.
2. Under *Build and deployment*, välj **Deploy from a branch**.
3. Välj din huvudbranch och mappen **/ (root)**, spara.
4. Efter någon minut ligger sidan på `https://<användarnamn>.github.io/multiplikation/`.

## Teknik

Ren HTML, CSS och JavaScript – inga ramverk, inga beroenden, inget byggsteg.

- `index.html` – sidans struktur och texterna under *Knepen*
- `style.css` – utseende, mobilanpassning
- `app.js` – quizmotor, statistik, rutnät och dynamiska tips
