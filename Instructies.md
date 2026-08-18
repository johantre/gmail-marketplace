# Marketplace tools — opzet (eenmalig)

Dit bouw je één keer op. De Sheet, het Form en de Slides-template blijven
daarna permanent bestaan ("mother-artifacts") — voor elke nieuwe Sprint
Review pas je enkel Config aan en klik je na afloop **🏛️Archive results** om
de resultaten te archiveren en te resetten, zie stap 8.

## 1. Sheet voorbereiden

Maak (of hergebruik) een leeg Google Sheet-bestand. De tabbladen zelf hoef je
niet manueel aan te maken — dat doet **📋Sheet structure setup/rebuild**
(zie stap 5) voor je, inclusief:

**Config** — met drie voorbeeldrijen om van te vertrekken:
| Topic | Desk | Beschrijving | Actief |
|---|---|---|---|
| Onboarding-flow | Bureau 3B | Nieuwe flow voor klanten | ✅ |
| Nieuwe API | Bureau 1A | REST-endpoints v2 | ✅ |
| Performance-verbeteringen | Bureau 2C | Snellere laadtijden | ✅ |

`Actief` is een echte checkbox-kolom. Enkel rijen met een vinkje worden
meegenomen in Form, Slides en checklist. Pas deze rijen aan naar de echte
topics — de voorbeeldrijen zijn enkel een startpunt. `Desk` is een echte
dropdown (geen vrij tekstveld), gevoed vanuit het `Plattegrond`-tabblad
hieronder — kies een bestaande plek, of maak eerst een nieuwe plek aan via
**🗺️Plattegrond beheren**.

**Plattegrond** — koppelt elke `Desk`-naam aan een positie op de
kantoor-plattegrond, voor de "📍 toon op kaart"-knop in de checklist-webapp.
Kolommen: `PlekNr` (een vast nummer, automatisch toegekend, wijzigt nooit —
puur de interne sleutel die de X/Y-positie aan een plek gekoppeld houdt),
`Label` (de naam zoals ze overal getoond wordt — vrij te hernoemen, moet
uniek zijn), `X%`/`Y%` (positie op de plattegrond-afbeelding) en `Actief`.
Vul dit tabblad NIET rechtstreeks in — gebruik het menu **🗺️Plattegrond
beheren**: dat opent een schermpje met de plattegrond waar je (1) met één
klik de bestaande `Desk`-namen uit Config kan importeren, (2) op de kaart
kan klikken om elke plek zijn positie te geven, (3) op een naam kan klikken
om te hernoemen (cascadeert automatisch naar elke cel in Config die die
naam gebruikte), (4) een pin kan verslepen om te verplaatsen, en (5) een
plek kan (de)activeren. Een plek hernoemen mag dus vrij — het vaste
`PlekNr` en de positie blijven ongemoeid, enkel het label verandert overal
mee.

De plattegrond-afbeelding zelf staat niet in de code, maar wordt live uit
Drive gehaald: er moet een map genaamd **`res`** naast dit Sheet-bestand
staan (zelfde Drive-map), met daarin een PNG met de naam uit de
`Plattegrond afbeelding`-rij in Instellingen (standaard `floorplan.png`).
Ontbreekt de map/het bestand, dan krijg je een duidelijke foutmelding
i.p.v. een lege plattegrond. Met de CI-opzet uit stap 9 (optioneel) gebeurt
dit automatisch: elke `git push` zet `gmail-marketplace/res/floorplan.png`
uit deze repo in die Drive-map (Git is dan de bron, Drive volgt) — zonder
CI moet je het bestand zelf één keer manueel in die map zetten.

**Aanmeldingen** — de kolomkoppen `Timestamp`, `E-mail`,
`Interesse (ruw)` en per actief topic `Interesse_<topic>` / `Bezocht_<topic>`
worden automatisch aangemaakt en bijgehouden. Dit tabblad vult zichzelf: een
installable trigger op het inschrijfformulier schrijft bij elke inschrijving
een rij weg (zie `Subscription.gs` → `onFormSubmitHandler`). Nooit manueel kolomkoppen
hernoemen — die worden door naam opgezocht.

**Dashboard** — wordt automatisch (her)opgebouwd met COUNTIF-formules per
topic (Ingeschreven / Bezocht / Nog te doen), telkens als je **📋Sheet
structure setup/rebuild** of **🔄 Sync topics Subscription form**
gebruikt.

**Instellingen** — `Sleutel | Waarde | Notitie`-tabel, startend met drie
rijen: `Review titel`, `Sprint goal` en `Max topics per slide`. **Elke rij
wordt automatisch een bruikbare placeholder** in de presentatie: rij
"Sleutel" `Locatie` met "Waarde" `Kantoor Antwerpen` → zet `{{Locatie}}`
ergens in de Slides-template en het wordt automatisch ingevuld. Nieuwe
losse variabele nodig (datum, ondertitel, ...)? Gewoon een rij toevoegen —
geen code nodig. (Dit geldt enkel voor losse, presentatiebrede waarden —
een extra veld PER TOPIC toevoegen aan Config zelf vraagt wel een
codewijziging.) De startwaarde van elke rij is gewoon de sleutelnaam zelf
(bv. `Review titel` start met waarde `Review titel`) — zo valt het meteen op
in een gegenereerde presentatie als je iets vergat in te vullen.

**Drie rijen zijn gereserveerd voor het script zelf** (herkenbaar aan de
tekst in kolom **Notitie** — niet verwijderen of hernoemen, wel gerust de
Waarde aanpassen):
- `Review titel` — naast placeholder ook gebruikt in de **bestandsnaam**
  van elke gegenereerde presentatie (bv. "Marketplace presentatie — Review
  Sprint 29 — 2026-08-14 1547").
- `Max topics per slide` — wordt niet als placeholder gebruikt, maar
  rechtstreeks door de code gelezen om te bepalen hoeveel topics er per
  topics-lijst-pagina komen (zie stap 3). Het template zelf hoeft hiervoor
  maar 1 bullet-regel te tonen — ontbrekende regels worden automatisch
  bijgemaakt tot dit aantal, met dezelfde bullet-opmaak.
- `Plattegrond afbeelding` — bestandsnaam van de plattegrond-PNG, opgezocht
  in de `res`-map naast dit Sheet-bestand in Drive (zie de Plattegrond-
  paragraaf hierboven). Standaardwaarde `floorplan.png`.

Alle andere rijen (zoals `Sprint goal`) zijn vrije, door jou toegevoegde
placeholders zonder speciale betekenis voor de code — voeg er gerust bij,
hernoem of verwijder ze.

**QR-codes** — twee kant-en-klare `=IMAGE(...)`-formules (600×600): **B3**
voor het inschrijfformulier, **G3** voor de checklist-app, elk met een
klikbare `=HYPERLINK(...)` er net onder (**B4**/**G4**) naar diezelfde URL —
handig als je de link rechtstreeks vanuit de Sheet wil openen zonder de QR
te moeten scannen (vooral voor wie de Sheet beheert). Worden automatisch
bijgewerkt door **🔄 Sync topics Subscription form** en **🔁 Regenerate
Checklist QR** (`setQrCodeFormula()`) — nooit manueel aanpassen, gewoon
uitprinten/tonen wat er staat. `=IMAGE()` past zich standaard aan de
**celgrootte** aan (niet aan de pixelgrootte van de bronafbeelding) — daarom
zet de code ook de rij-/kolomgrootte van B3/G3 zelf op 320px, anders blijft
de QR piepklein ongeacht de 600×600-bron.

## 2. Script koppelen

Extensies > Apps Script — dit maakt een nieuw, aan deze Sheet gebonden
script-project met zijn eigen Script-ID. De code zelf bestaat uit 15
`.gs`-bestanden (`Core.gs`, `Sheets.gs`, `Plattegrond.gs`,
`PlattegrondImage.gs`, `Subscription.gs`, `Slides.gs`, `SlidesBullets.gs`,
`SlidesTable.gs`, `Archive.gs`, `Cleanup.gs`, `JiraAuth.gs`, `Jira.gs`,
`JiraToConfig.gs`, `SelfTests.gs`, `Code.gs` — zie `CLAUDE_CODE_CONTEXT.md`
voor wat elk bestand doet) plus 2 `.html`-bestanden (`Checklist.html`,
`PlattegrondDialog.html`) en `appsscript.json` — samen alles wat in de
`gmail-marketplace/`-map van deze repo staat. (De `res/`-submap met de
originele plattegrond-PNG/SVG hoort daar niet bij — dat is enkel
brongmateriaal/bewerkbare bron in Git, niet iets dat `clasp push`
meeneemt. De PNG die de webapp/dialoog effectief toont, moet apart en
manueel in Drive gezet worden — zie de Plattegrond-paragraaf in stap 1.)

**Aanbevolen: via `clasp`** (zie ook stap 9 voor de CI-opzet die hier
verder op bouwt):
1. `clasp login` (eenmalig, opent een browser om in te loggen).
2. Zet het Script-ID van je NIEUWE project (Apps Script-editor >
   tandwiel-icoon Projectinstellingen > Script-ID) in `.clasp.json`'s
   `"scriptId"`-veld.
3. `clasp push --force` vanuit de `gmail-marketplace/`-map — dit zet alle
   bestanden in één keer klaar, inclusief het manifest (OAuth2-bibliotheek-
   referentie, webapp-instellingen). Geen 15 keer manueel copy-pasten.

**Alternatief: manueel** (geen lokale tooling nodig) — maak in de Apps
Script-editor voor elk van de 15 `.gs`-bestanden hierboven een nieuw
bestand met exact die naam, plak telkens de inhoud, en maak daarnaast de 2
`.html`-bestanden (Bestand > Nieuw > HTML) met de inhoud van `Checklist.html`
resp. `PlattegrondDialog.html`. Vergeet de OAuth2-bibliotheek niet toe te
voegen (zie stap 7) — die staat niet automatisch klaar bij een manuele
opzet.

Het inschrijfformulier vraagt bezoekers zelf hun e-mailadres in te typen
(een manueel veld) — automatische herkenning vanaf het ingelogde account
is bewust nog niet gebouwd, zie de TODO-lijst in `CLAUDE_CODE_CONTEXT.md`.

Sla op en keer terug naar de Sheet (herladen als het menu nog niet verschijnt,
zie stap 5).

## 3. Slides-template maken

Marketing bouwt dit volledig zelf op — de code raakt enkel wat hieronder
beschreven staat, al de rest (intro, tussenslides, eindslide, foto's, ...)
blijft precies zoals het gemaakt is. De topics-lijst mag als **bullet-lijst**
(tekstvak) en/of als **echte tabel** — hoe vaak en in welke combinatie je
wil: 1 tabel, 1 bullet-lijst, meerdere van beide, of allebei in hetzelfde
bestand (bv. om beide formaten uit te proberen, of omdat verschillende
slides bewust een ander opmaak-formaat willen). Elke plek waar de code een
patroon herkent, wordt onafhankelijk gevuld met de volledige topics-lijst
(elk met zijn eigen paginering) — het visuele formaat is puur een
templatekeuze en heeft geen invloed op wat de code toestaat. Enkel als er
**nergens** een patroon gevonden wordt, stopt de generatie met een
foutmelding.

### Optie A — Bullet-lijst (tekstvak)

Een tekstvak met een bullet-lijst waarvan de **eerste regel** letterlijk de
drie tokens `{{Topic}}`, `{{Desk}}` en `{{Beschrijving}}` bevat — in welke
volgorde en met welke scheidingstekens/woorden je zelf wil, bv.:

```
{{Topic}}/{{Desk}}/{{Beschrijving}}
```
of
```
{{Desk}} {{Topic}}: {{Beschrijving}}
```

De code neemt die regel letterlijk over en vervangt enkel de drie tokens —
volgorde, spaties, leestekens: allemaal jouw keuze, geen codewijziging nodig
als je dat later verandert.

**Hoeveel bullet-regels moet dat tekstvak hebben?** Precies **1** volstaat —
enkel om de stijl te tonen (lettertype, kleur, bullet-teken, ...). Ontbrekende
regels tot aan `Max topics per slide` (Instellingen, zie stap 1) maakt de
code er zelf bij, met exact dezelfde bullet-opmaak als die ene regel — geen
Lorem-ipsum-vulling meer nodig. Wil je toch al meer regels tonen (bv. om
zelf het eindresultaat te kunnen zien), dan mag dat ook, zolang je er niet
méér zet dan `Max topics per slide` (anders staan de teveel-regels er
gewoon bij als overtollige lege bullets — geen fout, maar wel onnodig).

### Optie B — Echte tabel

Een tabel met een rij waarvan de cellen letterlijk `{{Topic}}`, `{{Desk}}`
en `{{Beschrijving}}` bevatten — elk in hun eigen kolom, volgorde vrij te
kiezen (de code doorzoekt de cellen van die rij, kijkt niet naar vaste
kolomposities).

**Hoeveel rijen moet die tabel hebben?** Precies **1** volstaat — net als bij
de bullet-lijst. Ontbrekende rijen tot aan `Max topics per slide`
(Instellingen, zie stap 1) maakt de code er zelf bij, en kopieert daarbij
de **vulkleur en tekstopmaak** (font, grootte, kleur, vet/cursief) van je
patroonrij naar elke nieuwe rij. **Uitzondering: de rand (border) van een
nieuwe rij kan de code niet overnemen** — dat is een bevestigde beperking
van Google Slides zelf (geen enkele methode geeft toegang tot de rand van
een tabelcel), geen bug. Heeft je patroonrij een opvallende custom
randkleur, dan zal een automatisch bijgemaakte rij daar net iets van
afwijken (Slides' eigen standaardrand) — bij een presentatie van hooguit
een paar pagina's is dat een kleine manuele opsmuk-taak, geen blokkerend
probleem. Wil je toch al meer rijen tonen (bv. om zelf het eindresultaat
te zien, of om de rand overal manueel juist te zetten), dan mag dat ook,
zolang je er niet méér zet dan `Max topics per slide`.
Overtollige rijen op de laatste pagina (topics < capaciteit) worden volledig
**verwijderd** (niet enkel leeggemaakt) — net als bij bullet-modus.

### Voor beide opties

**Hoeveel topics komen er effectief per pagina?** Dat bepaalt `Max topics
per slide` uit Instellingen — voor beide modi. Zijn er meer actieve topics
dan de capaciteit, dan wordt de topics-slide automatisch het nodige aantal
keer gedupliceerd, en worden de topics zo **gelijk mogelijk verdeeld** over
die pagina's (bv. 31 topics met max 10 → 4 pagina's van 8/8/8/7, niet
10/10/10/1) — nooit een bijna-lege laatste pagina terwijl de vorige
pagina's volledig gevuld zijn. Heeft een pagina minder topics dan er
bullet-regels/tabelrijen beschikbaar zijn, dan worden de overtollige
regels/rijen in beide modi volledig **verwijderd** (niet enkel
leeggemaakt).

**Losse variabelen (optioneel, mogen overal):** elke rij in het
Instellingen-tabblad (zie stap 1) wordt een placeholder met exact dezelfde
tekst als de Sleutel-kolom, tussen `{{ }}`. Standaard is dat `{{Review titel}}`
(let op: mét spatie, letterlijk zoals de Sleutel-cel het zegt) — zet dat op
eender welke slide (bv. de titel van de introslide), mag ook op meerdere
plekken tegelijk. Wil je een extra losse variabele (datum, locatie, ...)?
Voeg een rij toe in Instellingen en gebruik `{{<die Sleutel>}}` — geen
codewijziging nodig.

**QR-codes op een slide (optioneel):** zet `{{ChecklistQR}}` en/of
`{{SubscriptionQR}}` op eender welke slide (bv. de eindslide) — mag ook op
meerdere plekken, en beide tokens mogen samen op dezelfde slide staan.
Elk wordt vervangen door een echte QR-code-afbeelding, op exact dezelfde
plaats en grootte als waar je de tekst zette. `{{ChecklistQR}}` verwijst
naar de checklist-webapp en vereist dat `WEBAPP_URL` al is ingesteld
(stap 6). `{{SubscriptionQR}}` verwijst naar het Subscription-formulier en
vereist dat je **🔄 Sync topics Subscription form** al minstens één
keer hebt uitgevoerd in deze cyclus. Ontbreekt de bijbehorende link nog,
dan blijft die ene placeholder-tekst gewoon onvervangen staan (de andere,
als aanwezig, wordt wel vervangen) — geen foutmelding.

Kopieer de bestands-ID uit de URL
(`https://docs.google.com/presentation/d/DEZE_ID_HIER/edit`).

## 4. Script properties invullen

In de Apps Script editor: tandwiel-icoon (Projectinstellingen) > Script properties > Add property:
- `SLIDES_TEMPLATE_ID` → de ID uit stap 3
- `DRIVE_FOLDER_ID` → **optioneel.** Als je gegenereerde presentaties
  (🖥️Generate Presentation) en het archief-Spreadsheet (🏛️Archive results)
  netjes in één specifieke Drive-map wil laten verschijnen in plaats van in
  "Mijn Drive" (root), maak je die map aan
  in Drive, open je ze, en kopieer je de ID uit de URL
  (`https://drive.google.com/drive/folders/DEZE_ID_HIER`). Laat je deze
  property leeg, dan komt alles gewoon in "Mijn Drive" terecht — functioneel
  geen probleem, enkel minder opgeruimd. Werkt ook met een map in een
  Gedeelde Drive (Shared Drive) — bestanden worden rechtstreeks in de
  juiste map aangemaakt (`makeCopy(naam, map)`), geen aparte "verplaats"-stap
  meer nodig die daar vroeger op kon mislukken.

`FORM_ID` en `ARCHIVE_SPREADSHEET_ID` moet je niet zelf zetten — die vult het
script automatisch in bij respectievelijk de eerste keer "🔄 Sync topics
Subscription form" en de eerste keer "Archive results".

`WEBAPP_URL` moet je wél zelf zetten, maar pas ná stap 6 (webapp deployen)
— zie daar voor de reden waarom dit bewust niet automatisch gebeurt.

`JIRA_OAUTH_CLIENT_ID`/`JIRA_OAUTH_CLIENT_SECRET` zijn enkel nodig als je
**🔷Fetch from Jira** wil gebruiken — zie stap 7, een aparte, optionele
opzet.

`SELFTEST_TOKEN` en `FLOORPLAN_SYNC_TOKEN` zijn enkel nodig als je de
CI-opzet uit stap 9 wil gebruiken (self-tests, resp. de floor-plan-sync
naar Drive, laten meedraaien in de Bitbucket-pipeline) — zie daar voor de
volledige uitleg. Los van deze Script properties horen ook nog **drie
Bitbucket repository-variabelen** (`CLASPRC_JSON_MARKETPLACE`,
`SELFTEST_TOKEN_MARKETPLACE`, `FLOORPLAN_SYNC_TOKEN_MARKETPLACE`) en de
**Jira OAuth-app-registratie** (Client ID/Secret bij Atlassian zelf, stap 7)
bij de volledige set credentials voor dit project — telkens enkel nodig
voor die ene optionele feature (Jira-koppeling resp. CI), niet voor de
kernwerking.

## 5. Machtigingen

Ga terug naar de Sheet, herlaad de pagina. Er verschijnt een menu
**"🛍️Marketplace tools"**. Klik eerst **"📋Sheet structure setup/rebuild"**
— dit maakt Config/Instellingen/QR-codes/Aanmeldingen/Dashboard/Jira aan
(of vult ontbrekende stukken aan als je Sheet al tabbladen had). De eerste
klik op een van de menu-acties vraagt om autorisatie (Sheets, Forms,
Drive, triggers) — eenmalig te bevestigen. (**🔷Fetch from Jira** vraagt
daarnaast zijn eigen, aparte Jira-autorisatie per gebruiker — zie stap 7.)

## 6. Webapp deployen (voor de checklist)

In Apps Script: **Implementeren > Nieuwe implementatie**
- Type: **Webapp**
- Uitvoeren als: **Ik (jouw account)**
- Toegang: **Iedereen** — vereist sinds de CI self-test-endpoint (zie
  hoofdstuk 9): Bitbucket's pipeline-runner heeft geen Google-login, dus
  "Iedereen binnen het domein" blokkeert die aanvraag (redirect naar een
  Google-inlogpagina) vóór ze `doGet()` ooit bereikt. De self-test-route
  zelf blijft apart beveiligd via `SELFTEST_TOKEN`; `getMyChecklist()` valt
  voor wie niet automatisch herkend wordt sowieso al terug op het
  e-mailveld, dus de code hoeft niet aangepast te worden voor externen.
  **Let op**: in `appsscript.json` moet dit `"access": "ANYONE_ANONYMOUS"`
  zijn, NIET `"ANYONE"` — die laatste betekent "eender welk, ingelogd
  Google-account", niet écht publiek, en zou Bitbucket's niet-ingelogde
  CI-runner nog steeds blokkeren. Deze waarde wordt bij elke `clasp deploy`
  correct toegepast, ook op een bestaande implementatie — geen manuele
  UI-stap nodig zolang het manifest de juiste waarde heeft.

Kopieer de gegeven **/exec**-webapp-URL en zet die als Script property
**`WEBAPP_URL`** (tandwiel-icoon > Script properties > Add property).
**Belangrijk:** dit moet je manueel doen — `ScriptApp.getService().getUrl()`
programmatisch ophalen vanuit een menu-functie geeft een bevestigde
Google-bug een URL met het **verkeerde deployment-ID** terug (Google lost
dit bewust niet op), wat exact de eerdere "Sorry, unable to open the file
at present"-fout veroorzaakte. Gebruik daarna in de Sheet
**🛍️Marketplace tools > 🔁 Regenerate Checklist QR** — die leest nu gewoon de
`WEBAPP_URL`-property uit. **Let op**: dit is een eenmalige/herstel-actie,
geen vaste stap in elke Review-cyclus — zie de uitleg bij "Gebruik tijdens
een Review-cyclus" hieronder voor waarom.

Deployt je een **nieuwe versie** van dezelfde deployment later (bv. na een
codewijziging, zoals de CI-pipeline bij elke `git push` doet)? De
`/exec`-URL blijft daarbij hetzelfde (bevestigd, ook na het manueel
aanpassen van het toegangsniveau hierboven), dus `WEBAPP_URL` moet je maar
één keer instellen.

## 7. Jira-koppeling opzetten (optioneel, voor 🔷Fetch from Jira)

Eenmalige, deels manuele opzet — enkel nodig als je een Jira-filter in de
Sheet wil kunnen ophalen. Elke gebruiker van de Sheet werkt daarna met zijn
**eigen** Atlassian-account, nooit een gedeeld account.

1. **OAuth2-bibliotheek toevoegen**: Apps Script-editor > **Bibliotheken**
   (linkse zijbalk) > `+` > script-ID
   `1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF` > laatste
   versie kiezen > identifier **`OAuth2`** laten staan > Toevoegen.
2. **Script-ID opzoeken**: Apps Script-editor > tandwiel-icoon
   **Projectinstellingen** > kopieer de **Script-ID**.
3. **Callback-URL berekenen**: `https://script.google.com/macros/d/<SCRIPT-ID>/usercallback`
   (met de ID uit stap 2 ingevuld).
4. **OAuth-app registreren bij Atlassian**: ga naar
   [developer.atlassian.com/console/myapps](https://developer.atlassian.com/console/myapps/),
   maak een nieuwe **OAuth 2.0 (3LO)**-app, activeer de **Jira API** met
   scopes `read:jira-work` en `offline_access`, en zet de callback-URL op
   de waarde uit stap 3.
5. **Client-ID/Secret invullen**: kopieer uit die Atlassian-app de
   **Client ID** en **Client Secret**, en zet die als Script properties
   **`JIRA_OAUTH_CLIENT_ID`** en **`JIRA_OAUTH_CLIENT_SECRET`**.
6. **Instellingen invullen** (tabblad Instellingen): `Jira filter ID`
   (te vinden in de URL van je filter in Jira, bv. `.../issues/?filter=12345`
   → ID is `12345`), optioneel `Jira project` (projectsleutel, enkel als
   je bovenop de filter zelf nog een extra beperking wil), `Max Jira items`
   (standaard 20), `Jira kolommen` (`Kolomnaam=jiraVeld`-paren,
   kommagescheiden — zie de standaardwaarde als voorbeeld, geneste velden
   mogen ook, bv. `Toegewezen aan=assignee.displayName`; `issuetype.iconUrl`
   is speciaal — dat veld verschijnt automatisch als een echt icoontje,
   niet als platte URL-tekst), en `Jira naar Config` (bepaalt hoe een
   aangevinkte Jira-rij naar Config gekopieerd wordt, zie stap 9 hieronder
   — `ConfigKolom=Jira-tabblad-kolomnaam`-paren, bv. `Topic=Titel`; `Desk`
   wordt bewust niet standaard gemapt, voeg zelf toe indien gewenst, bv.
   `Desk=Toegewezen aan`).
7. **📋Sheet structure setup/rebuild** draaien zodat het `Jira`-tabblad
   verschijnt.
8. **🔷Fetch from Jira** klikken — de eerste keer verschijnt een dialoog
   met een link om te autoriseren met je eigen Atlassian-account; klik
   daarna nogmaals op **🔷Fetch from Jira** om écht op te halen.
9. **Selectief naar Config kopiëren**: vink op het `Jira`-tabblad de
   **Select**-checkbox aan bij de rijen die je als topic wil gebruiken, en
   klik dan **📥Copy selected to Config**. De gekopieerde rijen verschijnen
   onderaan Config (met `Actief` al aangevinkt), en worden op het
   Jira-tabblad automatisch weer uitgevinkt zodat een tweede klik ze niet
   dubbel kopieert. **Let op**: aangevinkte-maar-nog-niet-gekopieerde rijen
   gaan verloren als je opnieuw **Fetch from Jira** draait vóór je
   kopieert (het tabblad wordt bij elke fetch volledig herbouwd) — kopieer
   dus eerst, fetch daarna pas opnieuw.

> **Geen "Jira host"-instelling nodig**: de API-calls lopen via een
> universele Atlassian-gateway (cloudid, automatisch opgezocht na het
> inloggen), niet via jullie eigen `*.atlassian.net`-domein.

## 8. Herbruiken voor een volgende Sprint Review

Geen Drive-kopie meer nodig. Sheet, Form en Slides-template blijven dezelfde
("mother-artifacts") over alle Reviews heen — enkel de resultaten van een
afgelopen cyclus (Aanmeldingen, Dashboard, Form-antwoorden) worden na afloop
gearchiveerd en gereset via **"🏛️Archive results"**. Pas Config aan naar de
topics/desks van de volgende Review (wanneer je maar wil, ook al vóór het
archiveren) en klik daarna opnieuw de acties hieronder aan.

## 9. CI opzetten (optioneel): automatisch deployen + self-tests in de pipeline

Eenmalige opzet zodat een `git push` naar `main` automatisch `clasp push` +
`clasp deploy` draait, gevolgd door een self-test-check die de build laat
falen bij een regressie — zonder dit moet elke codewijziging nog manueel
met `clasp push` vanuit een terminal gedeployed worden.

> **Let op — bekende beperking (zie CLAUDE_CODE_CONTEXT.md, TODO-punt 8)**:
> `CLASPRC_JSON_MARKETPLACE` hieronder wordt gekoppeld aan het
> `clasp login`-account van wie deze stap uitvoert — momenteel een
> persoonlijk account, niet een gedeeld/functioneel account. Verdwijnt dat
> account ooit, dan stopt deze pipeline-stap te werken. Los op te lossen
> met een eigen Workspace-functieaccount, zie de TODO-lijst voor de
> concrete stappen.

1. **Script properties `SELFTEST_TOKEN` en `FLOORPLAN_SYNC_TOKEN`**
   toevoegen (Apps Script > Projectinstellingen > Script properties): elk
   een lang, willekeurig geheim token naar keuze (twee verschillende
   waarden). Die beveiligen respectievelijk de self-test-URL
   (`?selftest=<token>`) en de floor-plan-sync-URL (`?floorplanSync=<token>`)
   tegen ongewenst extern aanroepen. `FLOORPLAN_SYNC_TOKEN` weglaten kan —
   die ene pipeline-stap wordt dan gewoon overgeslagen (zie stap 3).
2. In Bitbucket (Repository settings > Repository variables), nieuwe
   variabelen aanmaken:
   - **`CLASPRC_JSON_MARKETPLACE`** — base64 van je lokale `.clasprc.json`
     (na `clasp login`): `base64 -w0 ~/.clasprc.json`.
   - **`SELFTEST_TOKEN_MARKETPLACE`** — exact dezelfde waarde als de
     `SELFTEST_TOKEN` Script property uit stap 1.
   - **`FLOORPLAN_SYNC_TOKEN_MARKETPLACE`** (optioneel) — exact dezelfde
     waarde als de `FLOORPLAN_SYNC_TOKEN` Script property uit stap 1. Zonder
     deze variabele slaat de pipeline de floor-plan-sync gewoon over (met
     een duidelijke regel in de build-log) — de rest van de deploy draait
     gewoon door.
3. Klaar — vanaf de volgende `git push` naar `main` met wijzigingen onder
   `gmail-marketplace/**` draait de pipeline-stap "Deploy gmail-marketplace"
   automatisch (zie `bitbucket-pipelines.yml`, hoofdstuk root van de repo):
   `clasp push` → `clasp deploy` (vaste deployment-ID, dezelfde `/exec`-URL
   blijft dus geldig) → een `curl` naar `?selftest=...` die de build laat
   falen als de JSON-respons geen `"success":true` bevat → (indien
   `FLOORPLAN_SYNC_TOKEN_MARKETPLACE` gezet is) een `curl POST` van
   `gmail-marketplace/res/floorplan.png` naar `?floorplanSync=...`, zodat de
   PNG in de `res`-map naast de Sheet in Drive altijd overeenkomt met wat in
   Git staat (zie `handleFloorplanSyncRequest()`, `PlattegrondImage.gs`).

> **Waarom niet `clasp run`?** Dat Apps Script-CI-mechanisme vereist een
> Standard GCP-project, een aparte "API executable"-deployment, én eigen
> OAuth-credentials via de GCP Console — te veel extra opzet voor enkel de
> self-tests te draaien. De self-test-endpoint hierboven hergebruikt in
> plaats daarvan de al-bestaande webapp-deployment.

## 10. E-mailverzameling optimaliseren voor Acme-gebruikers (optioneel, eenmalig)

Zonder deze stap moet **elke** respondent — ook al zichtbaar ingelogd met
zijn Acme-account — zijn e-mailadres manueel intypen in het
inschrijfformulier. Google vult dat NIET automatisch aan (live bevestigd:
het formulier toont bovenaan "je bent ingelogd als ...", maar het
e-mailveld blijft leeg) — dat is geen bug, `FormApp`'s enige
e-mailcollectie-modus (`setCollectEmail(true)`) is altijd het manuele
"Responder input"-type, ongeacht login-status.

1. Draai minstens 1x **🔄 Sync topics Subscription form** zodat het
   Form-object bestaat.
2. Open het formulier zelf (niet de Apps Script-editor) — via de
   forms.gle-link/QR, of via [forms.google.com](https://forms.google.com) >
   Onlangs geopend.
3. Instellingen (tandwiel-icoon) > **Reacties** > **E-mailadressen
   verzamelen** > kies **Geverifieerd** in plaats van "Invoer door
   respondent".

Vanaf dan wordt het e-mailveld voor elke ingelogde Google-gebruiker
automatisch en niet-aanpasbaar ingevuld — geen getyp meer nodig.

> **Belangrijke, bewust aanvaarde beperking**: "Geverifieerd" vereist dat
> de respondent inlogt met **een** Google-account om te kunnen antwoorden
> — niet per se een Acme/Workspace-account (Google laat al lang toe een
> account te koppelen aan eender welk bestaand e-mailadres, "aanmelden met
> je e-mailadres"), maar wél *een* Google-account, sowieso. Een bezoeker
> zonder enig Google-account kan dan niet meer inschrijven. Dit is bewust
> aanvaard: op het moment van deze beslissing was de externe-bezoekers-
> usecase nog hypothetisch, tegenover een dagelijks, reëel ongemak voor
> Acme-medewerkers. Wordt dit ooit een echt probleem, dan zou een eigen
> "bezoeker-account"-systeem (los van Google-accounts) dit kunnen
> oplossen — een aanzienlijk grotere ingreep dan deze ene instelling, dus
> enkel de moeite waard als het écht nodig blijkt.

Deze instelling wordt niet door de code beheerd of overschreven —
`FormApp` (Apps Script) heeft geen manier om de collectie-MODUS
(Geverifieerd vs. Invoer door respondent) programmatisch te lezen of te
zetten, enkel om e-mailcollectie AAN/UIT te zetten. `generateForm()`'s
`setCollectEmail(true)` blijft dus gewoon draaien bij elke sync zonder
deze instelling te resetten.

## Gebruik tijdens een Review-cyclus

1. (eenmalig, bij de allereerste keer) **📋Sheet structure setup/rebuild**.
2. Config-tabblad invullen/aanpassen — handmatig, en/of (optioneel, als
   stap 7 is opgezet) via **🔷Fetch from Jira** gevolgd door
   **📥Copy selected to Config**: haal de stories/issues van je Jira-filter
   op, vink op het `Jira`-tabblad aan welke je als topic wil gebruiken, en
   kopieer ze zo naar Config (`Actief` staat meteen aangevinkt; vul `Desk`
   nog handmatig aan als die niet gemapt is).
3. Instellingen-tabblad: **Review titel** bijwerken (bv. "Review Sprint 25").
4. **🔄 Sync topics Subscription form** → deel de forms.gle-link/QR
   (of de QR-codes-tab, cel B3, klikbare link in B4).
5. **🖥️Generate Presentation** → PO gebruikt die tijdens de Review.
6. Checklist ophangen bij de ingang (QR-codes-tab, cel G3, klikbare link in
   G4) — bezoekers scannen en vinken zelf af tijdens de Marketplace. **Geen
   actie nodig hier**: die link/QR staat al sinds de allereerste opzet
   permanent klaar (zie stap 6 hierboven) en verandert nooit meer. Enkel
   als die cel ooit per ongeluk gewist wordt, gebruik je **🔁 Regenerate
   Checklist QR** om ze te herstellen.
7. Dashboard-tabblad toont live de voortgang (COUNTIF-formules, automatisch
   bijgewerkt).
8. **Na afloop van het event**: **🏛️Archive results** → bevestig de dialoog.
   De cijfers van deze cyclus staan dan als vaste waarden in het
   archief-Spreadsheet (link in de bevestigingsmelding), en
   Aanmeldingen/Dashboard/Form staan weer klaar voor de volgende Review.

## Testen voor je live gaat

0. **Self-tests draaien**: open het project in Apps Script, kies
   `runSelfTests` in het functie-dropdownmenu naast de Run-knop, en klik
   Run. Dit controleert automatisch of "wie is geïnteresseerd in welk
   topic" nog correct berekend wordt (o.a. de eerdere v1/v10/v12- en
   API/Nieuwe-API-verwarring), én of checkbox-weergave nooit een bestaande
   `true`-waarde stilletjes overschrijft (maakt en verwijdert daarvoor
   automatisch een tijdelijk tabblad `zzz_selftest_tmp`) — draai dit na
   **elke** codewijziging aan een van de `.gs`-bestanden (`assertEqual_`/
   `runSelfTests`/`runSelfTestsCore` staan in `SelfTests.gs`), vóór je
   verdergaat met de rest van deze checklist. Een gefaalde assertie gooit
   een duidelijke foutmelding; bij succes zie je een bevestigingsdialoog.
   Als je de CI-opzet uit stap 9 hebt gedaan, draait dit ook automatisch
   bij elke `git push` naar `main` — de build faalt zichtbaar bij een
   regressie, maar dat is geen vervanging voor deze manuele run tijdens
   het ontwikkelen zelf.
1. De menu-acties na elkaar doorlopen op een testkopie: 📋 → 🔄 → 🖥️ → 🔁.
2. Zelf het inschrijfformulier invullen (minstens één topic aanvinken;
   e-mail is automatisch ingevuld/vergrendeld als je stap 10 hebt gedaan,
   anders manueel intypen) en controleren dat er een nieuwe rij in
   `Aanmeldingen` verschijnt met de juiste `Interesse_<topic>`-waarden, en
   dat **alle** `Interesse_`/`Bezocht_`-cellen van die rij als een echte
   checkbox renderen (aan/uitvinkbaar), nooit als platte tekst "TRUE"/
   "FALSE".
3. De checklist-URL openen op een telefoon, een vakje aanvinken, en
   controleren dat `Bezocht_<topic>` in `Aanmeldingen` mee verandert. Test
   hierbij expliciet met topics waarvan de naam op elkaar lijkt (bv. "v1" en
   "v10", "v2" en "v27") — de checklist moet enkel de topics tonen waar je
   écht voor ingeschreven bent, nooit extra topics waarvan de naam toevallig
   een voorvoegsel is van een ander topic.
4. `Dashboard` openen en de tellingen aftoetsen tegen wat je net deed.
5. Een topic toevoegen aan Config, opnieuw **🔄 Sync topics Subscription
   form** klikken, en controleren dat de nieuwe `Interesse_`/`Bezocht_`-
   kolommen verschijnen zonder dat bestaande rijen/data verloren gaan, én
   dat bestaande rijen voor die nieuwe kolommen op **`false`** staan (dat
   topic bestond nog niet toen zij inschreven, dus konden ze er
   onmogelijk voor gekozen hebben — zie CLAUDE_CODE_CONTEXT.md voor waarom
   dit ooit fout via de ruwe tekst werd afgeleid).
6. Presentatie testen: controleer dat elke `{{<Sleutel>}}`-placeholder uit
   Instellingen (bv. `{{Review titel}}`) overal correct vervangen is, dat de
   bullet-opmaak op de ingevulde topic-regels behouden bleef, en dat de
   volgorde/scheidingstekens van je patroonregel exact gerespecteerd worden.
   Test ook dat het template met maar 1 bullet-regel volstaat: laat er maar
   1 in staan, zet `Max topics per slide` op bv. 10, activeer 3 topics in
   Config, en controleer dat de code zelf 2 extra bullet-regels bijmaakt met
   dezelfde opmaak (i.p.v. dat je zelf 10 regels in het template moet
   voorzien). Test ook de verdeling over meerdere pagina's: activeer 12
   topics, en controleer dat er 2 topics-pagina's verschijnen met **6 en 6**
   (gelijk verdeeld), niet 10 en 2.
7. Tabel-modus testen (los van bullet-modus, in een apart testtemplate met
   een gestylede patroonrij — vulkleur en/of een opvallende randkleur):
   - Test eerst met **meer actieve topics dan `Max topics per slide`**:
     controleer dat de code zelf extra rijen bijmaakt tot aan dat maximum,
     dat vulkleur en tekstopmaak (font, grootte, kleur, vet/cursief) van
     elke bijgemaakte rij overeenkomen met de patroonrij, **en dat de rand
     van die nieuwe rijen NIET overeenkomt** — dat laatste is verwacht
     gedrag (bevestigde Slides-beperking, geen bug), niet iets om te
     rapporteren als fout.
   - Test ook met **minder actieve topics dan de capaciteit**: controleer
     dat de overtollige rijen op de laatste pagina volledig verwijderd
     worden (niet enkel leeggemaakt) — net als bij bullet-modus.
   - Test de verdeling over meerdere pagina's net als bij bullets (bv. 12
     topics, max 10 → 2 pagina's van 6 en 6).
8. `{{ChecklistQR}}` én `{{SubscriptionQR}}` op een test-eindslide zetten
   en controleren dat beide afbeeldingen op exact de juiste
   plaats/grootte verschijnen en scanbaar zijn (vereist dat `WEBAPP_URL`
   al ingesteld is, resp. dat het Subscription form al minstens één keer
   gegenereerd is deze cyclus).
9. **🏛️Archive results** uitvoeren en controleren:
   - het archief-Spreadsheet bevat twee nieuwe tabbladen (`... — Dashboard`
     en `... — Aanmeldingen`) met de juiste cijfers/rijen en de
     formulier-/presentatie-link bovenaan het Dashboard-tabblad;
   - `Aanmeldingen` en `Dashboard` in de hoofd-Sheet zijn weer leeg;
   - **belangrijk**: probeer met hetzelfde test-e-mailadres opnieuw het
     formulier in te vullen — dit moet lukken (niet geblokkeerd worden door
     "één antwoord per gebruiker"). Dat bevestigt dat
     `Form.deleteAllResponses()` de per-gebruiker-limiet effectief opheft.
10. **🔷Fetch from Jira** testen (na de eenmalige opzet in stap 7):
    - eerste klik (nog niet geautoriseerd): dialoog met werkende
      autorisatielink verschijnt; na autoriseren en een tweede klik komt
      het `Jira`-tabblad gevuld terug;
    - afkap-melding: zet `Max Jira items` lager dan het echte aantal
      resultaten van je filter, en controleer dat zowel de afsluitende
      melding als een notitie-cel in het `Jira`-tabblad duidelijk maken dat
      er meer resultaten zijn (Jira's nieuwere API geeft geen exact totaal
      meer terug, enkel "er zijn nog meer");
    - foute/ontoegankelijke `Jira filter ID`: duidelijke foutmelding, geen
      stille lege tab;
    - een niet-bestaande veldnaam in `Jira kolommen`: geen crash, die
      kolom blijft leeg en wordt vermeld in de afsluitende melding;
    - `issuetype.iconUrl` in `Jira kolommen`: controleer dat die kolom een
      echt icoontje toont, geen platte URL-tekst;
    - **kernvereiste**: laat een tweede, echte Atlassian-account
      autoriseren en fetchen — bevestig dat elke gebruiker zijn eigen
      Jira-identiteit gebruikt, nooit een gedeelde.
11. **📥Copy selected to Config** testen: vink een paar rijen aan op het
    `Jira`-tabblad, klik de actie, en controleer dat precies die rijen
    onderaan Config verschijnen (met `Actief` aangevinkt) en dat ze
    nadien op het `Jira`-tabblad automatisch weer uitgevinkt staan. Test
    ook: niks aangevinkt → duidelijke "niets om te kopiëren"-melding, geen
    stille no-op.
