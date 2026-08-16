// ============================================================
// SHEET STRUCTURE — creates/restores Config, Instellingen, QR-codes,
//    Aanmeldingen, Dashboard and the Jira tab (ensureJiraSheet() itself
//    lives in Jira.gs). Idempotent: existing tabs/columns/data stay
//    untouched, only missing pieces get added. So this is safe to run
//    again on a Sheet that's already in use. Shared helpers this builds on
//    (getSettings, styleHeaderRow, applyBrandFont, applyCheckboxValidation,
//    ...) live in Core.gs.
// ============================================================
function setupSheetStructure() {
  ensureConfigSheet();
  ensureInstellingenSheet();
  ensureQrCodesSheet();
  syncAanmeldingenColumns();
  ensureDashboard();
  ensureJiraSheet();
  SpreadsheetApp.getUi().alert(
    'Sheet structure ready: Config, Instellingen, QR-codes, Aanmeldingen, ' +
    'Dashboard and Jira tabs are all set up.\n\nFill in Config and Instellingen, ' +
    'then click "🔄 Sync topics Subscription form".'
  );
}

// Small tab for loose settings that change per Review cycle but don't
// belong in Config (Config is a per-topic list, no place for a single
// loose value). Every row here automatically becomes a usable placeholder
// in the Slides template: row "Review titel" -> placeholder {{Review titel}}
// (literally the same text as in the Sleutel column, incl. spaces). Add a
// new row = add a new variable, no code needed.
// "Max topics per slide" is the exception: that row is NOT used as a text
// placeholder, but read directly by the code (see
// MAX_TOPICS_PER_SLIDE_KEY/getInstellingWaarde) to determine how many
// topics fit per page of the topics list slide — decoupled from however
// many bullet lines the template physically happens to contain.
var MAX_TOPICS_PER_SLIDE_KEY = 'Max topics per slide';
// Reserved keys for the Jira import (section 5) — same "reserved, code
// reads it directly" class as MAX_TOPICS_PER_SLIDE_KEY, not a text
// placeholder. See section 5 for how each is used.
var JIRA_FILTER_ID_KEY = 'Jira filter ID';
var JIRA_PROJECT_KEY = 'Jira project';
var MAX_JIRA_ITEMS_KEY = 'Max Jira items';
var JIRA_KOLOMMEN_KEY = 'Jira kolommen';
var JIRA_CONFIG_MAPPING_KEY = 'Jira naar Config';
// Default value = the key name itself (e.g. "Review titel" gets "Review
// titel" as its starting value) — recognizable as "not filled in yet" if
// it ever shows up unreplaced in a generated presentation.
// Max topics per slide is the exception: that one starts at a genuinely
// usable 10. The 4 Jira keys are the same kind of exception — reserved,
// code-read values, not text placeholders.
// Third column ("Notitie") is only filled in for keys the SCRIPT itself
// reads by name (reserved) — every other row is a free-form placeholder
// the user can add/rename/remove at will, with no note.
//
// This is a function rather than a top-level constant on purpose: it
// references other top-level vars (JIRA_FILTER_ID_KEY etc.), and once
// Code.gs is split across multiple files, cross-file top-level var
// initializers are only safe if evaluated after every file has loaded —
// Apps Script runs top-level code in editor-list/filePushOrder order, not
// guaranteed alphabetical. Wrapping it in a function means it only builds
// the array when called (from ensureInstellingenSheet, itself only ever
// invoked from a menu action), well after all files are loaded — so file
// split order can't break it.
function getInstellingenSeedRows() {
  return [
    ['Review titel', 'Review titel', 'Reserved for the script — also used in the filename of every generated presentation. Variable — do not delete or rename.'],
    ['Sprint goal', 'Sprint goal', ''],
    [MAX_TOPICS_PER_SLIDE_KEY, '10', 'Reserved for the script — determines how many topics fit per page in the presentation. Variable — do not delete or rename.'],
    [JIRA_FILTER_ID_KEY, '', 'Reserved for the script — ID of the saved Jira filter that "🔷Fetch from Jira" fetches (found in the filter\'s URL in Jira, e.g. .../issues/?filter=12345 → ID is 12345). Variable — do not delete or rename.'],
    [JIRA_PROJECT_KEY, '', 'Reserved for the script — optional: project key (e.g. ROB) to restrict results to 1 project on top of the filter itself. Empty = just the filter\'s own scope. Variable — do not delete or rename.'],
    [MAX_JIRA_ITEMS_KEY, '20', 'Reserved for the script — upper limit on how many Jira issues get fetched at once. Variable — do not delete or rename.'],
    [JIRA_KOLOMMEN_KEY, 'Type=issuetype.iconUrl, Titel=summary, Status=status.name, Toegewezen aan=assignee.displayName, Prioriteit=priority.name, Vervaldatum=duedate', 'Reserved for the script — comma-separated "ColumnName=jiraFieldPath" pairs; determines which Jira fields get fetched and under which column name they appear on the "Jira" tab. "issuetype.iconUrl" automatically renders as a real image instead of plain URL text. Variable — do not delete or rename.'],
    [JIRA_CONFIG_MAPPING_KEY, 'Topic=Titel, Beschrijving=Status', 'Reserved for the script — comma-separated "ConfigColumn=Jira-tab-columnName" pairs; determines how a checked row on the Jira tab gets copied to Config via "📥Copy selected to Config". "Desk" is deliberately not mapped by default (no natural Jira equivalent) — add it yourself (e.g. Desk=Toegewezen aan) if wanted. Actief always starts checked on a copy. Variable — do not delete or rename.']
  ];
}

// Idempotent and self-healing: creates the tab if it doesn't exist yet,
// and then fills in any missing keys from getInstellingenSeedRows() — even on
// a tab that already existed before a new key was added (e.g. Max topics
// per slide), without touching existing VALUES (column B, user-editable
// data). The Notitie (column C) is different: it's script-controlled
// explanatory text for reserved keys, never user-authored free-form
// content, so it's always overwritten to match getInstellingenSeedRows() —
// same "always reapply" idiom as styleHeaderRow/applyBrandFont elsewhere
// in this file. Without this, editing a Notitie string in code (e.g. to
// fix its language) would silently never reach a Sheet that already had
// that row seeded, since a plain "only fill if empty" backfill would
// never touch an already-filled cell.
function ensureInstellingenSheet() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName('Instellingen');
  if (!sheet) {
    sheet = ss.insertSheet('Instellingen');
    sheet.getRange(1, 1, 1, 3).setValues([['Sleutel', 'Waarde', 'Notitie']]);
    sheet.setFrozenRows(1);
  }

  var seedRows = getInstellingenSeedRows();

  var existingKeys = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0] || '').trim(); })
    : [];

  seedRows.forEach(function (row) {
    if (existingKeys.indexOf(row[0]) === -1) sheet.appendRow(row);
  });

  var dataRows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues() : [];
  dataRows.forEach(function (r, i) {
    var seed = seedRows.filter(function (s) { return s[0] === String(r[0] || '').trim(); })[0];
    if (seed && seed[2]) sheet.getRange(2 + i, 3).setValue(seed[2]);
  });

  styleHeaderRow(sheet, 3);
  applyBrandFont(sheet);
  return sheet;
}

// Tab holding the QR codes themselves as images (instead of only showing a
// formula in a Ui.alert that you'd have to paste manually). B3 = subscription
// form, G3 = checklist — see setQrCodeFormula(), called from generateForm()
// and showChecklistLink(). Row 4 (QR_LINK_ROW) holds a plain clickable
// HYPERLINK to the same URL, directly below each QR image — a way to reach
// the link straight from the Sheet without depending on scanning/viewing
// the QR image itself, mainly for whoever manages this Sheet.
var QR_ROW = 3;
var QR_LINK_ROW = 4;
var QR_SUBSCRIPTION_COL = 2; // B
var QR_CHECKLIST_COL = 7;    // G
var QR_CELL_PIXELS = 320;    // row/column size the image needs

function ensureQrCodesSheet() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName('QR-codes');
  if (!sheet) {
    sheet = ss.insertSheet('QR-codes');
    sheet.getRange(1, QR_SUBSCRIPTION_COL).setValue('Subscription Form');
    sheet.getRange(1, QR_CHECKLIST_COL).setValue('Checklist Form');
  }

  // Outside the if: an already-existing tab also gets the styling reapplied.
  [QR_SUBSCRIPTION_COL, QR_CHECKLIST_COL].forEach(function (col) {
    sheet.getRange(1, col)
      .setBackground(BRAND_HEADER_BG)
      .setFontColor(BRAND_HEADER_FG)
      .setFontWeight('bold')
      .setFontFamily(BRAND_FONT);
    // =IMAGE() scales to the CELL size by default (not to the pixel size of
    // the source image) — so explicitly make the row/column big enough,
    // otherwise the QR stays tiny regardless of size=600x600.
    sheet.setColumnWidth(col, QR_CELL_PIXELS);
  });
  sheet.setRowHeight(QR_ROW, QR_CELL_PIXELS);
  applyBrandFont(sheet);
  return sheet;
}

// Writes the QR image formula (same qrserver.com endpoint as the Ui.alert
// text) directly into the given cell of the QR-codes tab, plus a plain
// HYPERLINK right below it. linkText is optional — defaults to the URL
// itself (fine for an already-short URL like the Subscription form's
// forms.gle link); pass a friendly label for a long URL (e.g. the
// Checklist's raw /exec URL) so the cell doesn't look cluttered — no
// actual URL-shortening involved, just a nicer display label.
function setQrCodeFormula(col, url, linkText) {
  var sheet = ensureQrCodesSheet();
  var formula = '=IMAGE("https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=" & ENCODEURL("' + url + '"))';
  sheet.getRange(QR_ROW, col).setFormula(formula);
  sheet.getRange(QR_LINK_ROW, col).setFormula('=HYPERLINK("' + url + '", "' + (linkText || url) + '")');
}

// Reads a single setting (e.g. for use in code logic, as opposed to
// applyInstellingenPlaceholders which treats EVERY row as a text
// placeholder). Returns '' if the tab or the key is missing.
function getInstellingWaarde(key) {
  var sheet = SpreadsheetApp.getActive().getSheetByName('Instellingen');
  if (!sheet) return '';
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim() === key) return String(rows[i][1] || '').trim();
  }
  return '';
}

// Replaces {{<Sleutel>}} throughout the whole presentation with the
// matching Waarde, for every row in Instellingen (except the header). If
// the tab is missing, nothing happens — not a hard requirement.
function applyInstellingenPlaceholders(deck) {
  var sheet = SpreadsheetApp.getActive().getSheetByName('Instellingen');
  if (!sheet) return;
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var key = String(rows[i][0] || '').trim();
    if (!key) continue;
    deck.replaceAllText('{{' + key + '}}', String(rows[i][1] || '').trim());
  }
}

function ensureConfigSheet() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName('Config');
  if (!sheet) {
    sheet = ss.insertSheet('Config');
    sheet.getRange(1, 1, 1, 4).setValues([['Topic', 'Desk', 'Beschrijving', 'Actief']]);
    sheet.setFrozenRows(1);

    var sample = [
      ['Onboarding-flow', 'Bureau 3B', 'Nieuwe flow voor klanten', true],
      ['Nieuwe API', 'Bureau 1A', 'REST-endpoints v2', true],
      ['Performance-verbeteringen', 'Bureau 2C', 'Snellere laadtijden', true]
    ];
    sheet.getRange(2, 1, sample.length, 3).setValues(sample.map(function (r) { return r.slice(0, 3); }));
    var actiefRange = sheet.getRange(2, 4, sample.length, 1);
    actiefRange.insertCheckboxes();
    actiefRange.setValues(sample.map(function (r) { return [r[3]]; }));
  }

  // Outside the if: an already-existing tab (e.g. from before the brand
  // style existed) still gets the styling applied on every rebuild.
  styleHeaderRow(sheet, 4);
  applyBrandFont(sheet);
  return sheet;
}

var AANMELDINGEN_BASE_HEADERS = ['Timestamp', 'E-mail', 'Interesse (ruw)'];

function ensureAanmeldingenHeaders() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName('Aanmeldingen');
  if (!sheet) {
    sheet = ss.insertSheet('Aanmeldingen');
    sheet.getRange(1, 1, 1, AANMELDINGEN_BASE_HEADERS.length).setValues([AANMELDINGEN_BASE_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Adds the Interesse_<topic>/Bezocht_<topic> columns per active topic if
// they don't exist yet (never removed — columns of deactivated topics stay
// for the history) and backfills existing rows for the new column with
// false. Idempotent: safe to call again anytime.
//
// Why "false" and not "read it from the raw answer text": a brand new
// Interesse_<topic> column only ever gets created here or in
// onFormSubmitHandler (both always call this before appending a row), so if
// a column doesn't exist yet for a topic, that topic was never offered as a
// form choice to any respondent already in the sheet — their historical
// answer literally cannot contain it. There is therefore exactly one
// correct backfill value: false. (An earlier version of this function
// backfilled by substring-searching the topic name inside "Interesse
// (ruw)" — that reintroduced the exact same collision bug that
// getMyChecklist() had already been fixed for, e.g. "Performance-
// verbeteringen v1" matching inside "...v10 (Bureau 1A)...". Since
// Interesse_<topic> is the single column Dashboard (COUNTIF) and
// getMyChecklist() both read, that bug corrupted both at once. See
// runSelfTests() for a regression guard on this.)
function syncAanmeldingenColumns() {
  var sheet = ensureAanmeldingenHeaders();
  var lastRow = sheet.getLastRow();
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var topics = getActiveTopics();

  topics.forEach(function (t) {
    ['Interesse_' + t.topic, 'Bezocht_' + t.topic].forEach(function (name) {
      if (header.indexOf(name) !== -1) return;

      var newColIndex = header.length + 1;
      sheet.getRange(1, newColIndex).setValue(name);
      header.push(name);
      if (lastRow < 2) return;

      var fillRange = sheet.getRange(2, newColIndex, lastRow - 1, 1);
      fillRange.insertCheckboxes();
      fillRange.setValue(false);
    });
  });

  // Outside the topic loop, and unconditional (not just for columns this
  // call happened to create): re-applies checkbox RENDERING (not value —
  // see applyCheckboxValidation(), NOT insertCheckboxes() here on purpose)
  // to EVERY existing Interesse_/Bezocht_ cell. Needed because appendRow()
  // in onFormSubmitHandler writes plain true/false values with no data
  // validation of its own — without this, a freshly submitted row would
  // permanently show as plain "TRUE"/"FALSE" text instead of a checkbox,
  // while only rows that happened to exist at column-creation time (the
  // backfill above) got real checkboxes. That exact inconsistency (some
  // cells checkboxes, some plain text, in the very same row) was spotted
  // live. Safe to call again anytime — same idempotent "ensure*" pattern
  // used everywhere else in this file (e.g. styleHeaderRow/applyBrandFont
  // below, which also always reapply rather than only on creation).
  //
  // Deliberately scans the HEADER ROW itself (every Interesse_/Bezocht_
  // column that exists), not topics/getActiveTopics() — columns of
  // deactivated topics are never removed (see the function comment above)
  // and must stay just as visually consistent as active ones. An earlier
  // version of this loop iterated `topics` (active-only) and silently
  // skipped every deactivated topic's columns — exactly why some columns
  // kept showing plain "TRUE"/"FALSE" text even after re-running this.
  lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    header.forEach(function (name, i) {
      if (name.indexOf('Interesse_') === 0 || name.indexOf('Bezocht_') === 0) {
        applyCheckboxValidation(sheet.getRange(2, i + 1, lastRow - 1, 1));
      }
    });
  }

  styleHeaderRow(sheet, header.length);
  applyBrandFont(sheet);
}

function columnToLetter(column) {
  var letter = '';
  while (column > 0) {
    var rem = (column - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    column = Math.floor((column - 1) / 26);
  }
  return letter;
}

// Finds the column letter of a header in Aanmeldingen (for Dashboard formulas).
function aanmeldingenColumnLetter(headerName) {
  var sheet = SpreadsheetApp.getActive().getSheetByName('Aanmeldingen');
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = header.indexOf(headerName);
  return idx === -1 ? null : columnToLetter(idx + 1);
}

// Fully rebuilds the Dashboard tab based on the currently active topics —
// call this only AFTER syncAanmeldingenColumns() so the
// Interesse_/Bezocht_ columns already exist.
function ensureDashboard() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName('Dashboard') || ss.insertSheet('Dashboard');
  sheet.clear();

  var headers = ['Topic', 'Desk', 'Ingeschreven', 'Bezocht', 'Nog te doen', 'Voortgang'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  styleHeaderRow(sheet, headers.length);

  var topics = getActiveTopics();
  if (!topics.length) return;

  var rows = topics.map(function (t, i) {
    var row = i + 2;
    var interesseCol = aanmeldingenColumnLetter('Interesse_' + t.topic);
    var bezochtCol = aanmeldingenColumnLetter('Bezocht_' + t.topic);
    return [
      t.topic,
      t.desk,
      interesseCol ? '=COUNTIF(Aanmeldingen!' + interesseCol + ':' + interesseCol + ',TRUE)' : 0,
      bezochtCol ? '=COUNTIF(Aanmeldingen!' + bezochtCol + ':' + bezochtCol + ',TRUE)' : 0,
      '=C' + row + '-D' + row,
      progressBarFormula(row)
    ];
  });
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.setColumnWidth(6, 160); // room for the in-cell progress bar
  applyBrandFont(sheet);
}

// In-cell horizontal progress bar (SPARKLINE bar) for the same row: green
// = done, neutral gray = still to do.
function progressBarFormula(row) {
  // "bar" expects TWO values that together fill the bar (each its own
  // color), not a single ratio with a "max" — Bezocht (D) + Nog te doen
  // (E) always add up to Ingeschreven by construction, so passing those
  // two directly auto-scales to a full, correctly proportioned bar.
  // Special case: Ingeschreven (C) = 0 would otherwise render as a
  // meaningless full {0,0} bar (Sheets fills it solid in color1, looking
  // like "100% done") — show a distinct solid pastel-red bar instead, so
  // "nobody signed up yet" is never confused with "fully done".
  return '=IF(C' + row + '=0,' +
    'SPARKLINE({1,0},{"charttype","bar";"color1","' + BRAND_NONE_COLOR + '";"color2","' + BRAND_NONE_COLOR + '"}),' +
    'SPARKLINE({D' + row + ',E' + row + '},{"charttype","bar";"color1","' + BRAND_DONE_COLOR + '";"color2","' + BRAND_TODO_COLOR + '"}))';
}
