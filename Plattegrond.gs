// ============================================================
// PLATTEGROND — the "Plattegrond" tab (PlekNr | Label | X% | Y% | Actief)
//    is the single source of truth for WHERE each desk/spot sits on the
//    office floor plan (X%/Y% = position as a percentage of the floor plan
//    image's width/height, so it stays correct regardless of image size).
//
//    PlekNr is a permanent, auto-assigned number — it exists purely as the
//    stable row-key that keeps a desk's tagged X/Y position attached even
//    when its Label is renamed. Config!Desk stores the Label as plain
//    text, NOT the PlekNr: a normal data-validation dropdown, kept
//    human-readable on purpose since Config is meant to stay directly
//    editable by non-developers (see Instructies.md). Renaming a Label
//    therefore needs an explicit cascade into every Config!Desk cell that
//    held the old text — see cascadeDeskRename(), the only place that
//    happens. Nothing else durably stores a copy of a Label (Aanmeldingen/
//    Dashboard/archief only ever store Topic + booleans, never Desk), so
//    that's the full blast radius of a rename.
//
//    The dropdown itself (applyDeskDropdownValidation()) is bound to a
//    small helper formula in Plattegrond!G2 — an alphabetically-sorted,
//    blank-filtered live copy of Label (=SORT(FILTER(...))) — rather than
//    to Label directly, for two reasons at once: (1) it sorts the dropdown
//    alphabetically instead of Plattegrond's own row order, and (2) both
//    ends of the wiring (this helper range and the Config!Desk range it
//    feeds) are fixed-size ranges that never need to grow, so a plek added
//    ANY way — through the dialog, or typed straight into this sheet by
//    hand, matching Config's own "just type a row" spirit — shows up in
//    the dropdown immediately, with no script re-run needed.
//
//    Tagging itself happens through a dedicated HtmlService dialog
//    (PlattegrondDialog.html, opened via "🗺️Plattegrond beheren" in the
//    menu): click an empty spot on the floor plan to add a new plek, click
//    an existing pin's label to rename it, drag a pin to reposition it, or
//    use the ✕ toggle to (de)activate it. The floor plan image itself is
//    fetched from Drive at runtime — see PlattegrondImage.gs.
// ============================================================

var PLATTEGROND_HEADERS = ['PlekNr', 'Label', 'X%', 'Y%', 'Actief'];

// Column G: the sorted-dropdown-source helper (see file header). Fixed,
// generous size shared with Config's own dropdown range
// (applyDeskDropdownValidation()) — deliberately NOT tied to however many
// plekken currently exist, that's the whole point of never needing a
// re-run.
var DESK_DROPDOWN_HELPER_COL = 7;
var DESK_DROPDOWN_ROWS = 500;

function ensurePlattegrondSheet() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName('Plattegrond');
  if (!sheet) {
    sheet = ss.insertSheet('Plattegrond');
    sheet.getRange(1, 1, 1, PLATTEGROND_HEADERS.length).setValues([PLATTEGROND_HEADERS]);
    sheet.setFrozenRows(1);
  }

  // Outside the if, same "always reapply" idiom as the rest of this
  // project (styleHeaderRow/applyBrandFont/applyCheckboxValidation) — safe
  // to call again anytime, including right after appendRow() elsewhere in
  // this file.
  styleHeaderRow(sheet, PLATTEGROND_HEADERS.length);
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) applyCheckboxValidation(sheet.getRange(2, 5, lastRow - 1, 1));
  applyBrandFont(sheet);

  // Self-healing (same idiom): reapplied unconditionally so it recovers if
  // this cell is ever accidentally cleared. FILTER first drops blank Label
  // cells (a plek can briefly exist with PlekNr/position but no name while
  // being typed by hand) before SORT — SORT alone would throw/misbehave on
  // blanks mixed with text. IFERROR covers the zero-plekken case, where
  // FILTER itself throws #N/A for "nothing matched".
  var helperLastRow = 1 + DESK_DROPDOWN_ROWS;
  sheet.getRange(1, DESK_DROPDOWN_HELPER_COL).setValue('Dropdown-bron (automatisch, niet aanpassen)');
  sheet.getRange(2, DESK_DROPDOWN_HELPER_COL).setFormula(
    '=IFERROR(SORT(FILTER(B2:B' + helperLastRow + ',B2:B' + helperLastRow + '<>"")),"")'
  );

  return sheet;
}

// Reads every plek row as a plain object. rowIndex is the 1-based Sheet
// row — the stable handle the dialog uses to address a specific plek for
// rename/reposition/(de)activate (PlekNr is only shown to the user, never
// used to look a row up — that would mean re-scanning on every call for no
// benefit, rowIndex already IS the row).
function getAllePlekken() {
  var sheet = ensurePlattegrondSheet();
  var rows = sheet.getDataRange().getValues();
  var plekken = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (r[0] === '' && r[1] === '') continue; // skip fully empty trailing rows
    plekken.push({
      rowIndex: i + 1,
      plekNr: r[0],
      label: String(r[1] || ''),
      x: r[2] === '' ? null : Number(r[2]),
      y: r[3] === '' ? null : Number(r[3]),
      actief: r[4] === true
    });
  }
  return plekken;
}

function nextPlekNr(plekken) {
  var max = 0;
  plekken.forEach(function (p) {
    if (typeof p.plekNr === 'number' && p.plekNr > max) max = p.plekNr;
  });
  return max + 1;
}

// Case-insensitive, trimmed — Labels are shown to visitors as-is and feed
// a plain Sheets dropdown, so "Team Rocket" and "team rocket " must count
// as the same name. ignoreRowIndex lets renamePlek() compare a plek
// against every OTHER row without tripping over itself.
function isLabelTaken(plekken, label, ignoreRowIndex) {
  var norm = String(label).trim().toLowerCase();
  return plekken.some(function (p) {
    return p.rowIndex !== ignoreRowIndex && String(p.label).trim().toLowerCase() === norm;
  });
}

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

// Live dropdown for Config!Desk, sourced from the sorted helper range in
// Plattegrond (column G, see ensurePlattegrondSheet) rather than Label
// directly — shows plekken alphabetically, not in Plattegrond's row order.
// Both this range and the helper range behind it are fixed-size, so this
// only needs to be called once (from setupSheetStructure) — a plek added,
// renamed, or typed by hand afterwards shows up via the live SORT/FILTER
// formula alone, no re-run needed. Still idempotent/cheap to call again
// (e.g. if Config didn't exist yet the first time). Deactivated plekken
// deliberately stay IN the list (same spirit as a deactivated Topic still
// showing, just unchecked, in Config itself) — simplest option, revisit
// only if that turns out to actually bother someone in practice.
function applyDeskDropdownValidation() {
  var configSheet = SpreadsheetApp.getActive().getSheetByName('Config');
  var plattegrondSheet = ensurePlattegrondSheet();
  if (!configSheet) return;

  var helperRange = plattegrondSheet.getRange(2, DESK_DROPDOWN_HELPER_COL, DESK_DROPDOWN_ROWS, 1);
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(helperRange, true)
    .setAllowInvalid(true) // warn, don't hard-block: a desk not tagged in Plattegrond yet must stay typeable
    .build();
  configSheet.getRange(2, 2, DESK_DROPDOWN_ROWS, 1).setDataValidation(rule);
}

// Reads the current distinct Desk values straight from Config and creates
// a new Plattegrond row (untagged: X/Y left empty) for every one that isn't
// already a Label there yet — the "phase 1" bootstrap described when this
// feature was designed: start from what Config already has, then tag each
// one's position via the dialog. Idempotent (safe to click again — only
// adds what's still missing) and never touches an existing row. Returns
// the list of newly-added Labels so the dialog can report back what
// changed.
function importDeskenVanuitConfig() {
  var configSheet = SpreadsheetApp.getActive().getSheetByName('Config');
  if (!configSheet) return [];

  var rows = configSheet.getDataRange().getValues();
  var deskNames = [];
  for (var i = 1; i < rows.length; i++) {
    var desk = String(rows[i][1] || '').trim();
    if (desk && deskNames.indexOf(desk) === -1) deskNames.push(desk);
  }

  var sheet = ensurePlattegrondSheet();
  var plekken = getAllePlekken();
  var added = [];
  deskNames.forEach(function (desk) {
    if (isLabelTaken(plekken, desk, -1)) return;
    var plekNr = nextPlekNr(plekken);
    sheet.appendRow([plekNr, desk, '', '', true]);
    plekken.push({ rowIndex: sheet.getLastRow(), plekNr: plekNr, label: desk, x: null, y: null, actief: true });
    added.push(desk);
  });

  ensurePlattegrondSheet(); // reapply checkbox validation to the newly appended rows
  return added;
}

// Adds a brand-new plek at a clicked position (PlattegrondDialog.html).
// Throws (caught client-side via withFailureHandler) on a duplicate name.
function addPlek(label, xPct, yPct) {
  label = String(label || '').trim();
  if (!label) throw new Error('Naam mag niet leeg zijn.');

  var sheet = ensurePlattegrondSheet();
  var plekken = getAllePlekken();
  if (isLabelTaken(plekken, label, -1)) {
    throw new Error('Er bestaat al een plek met de naam "' + label + '". Namen moeten uniek zijn.');
  }

  var plekNr = nextPlekNr(plekken);
  sheet.appendRow([plekNr, label, round1(xPct), round1(yPct), true]);
  ensurePlattegrondSheet();
  return getAllePlekken();
}

// Repositions an existing plek (drag-and-drop in the dialog) — never
// touches Label/Actief, so no rename cascade or dropdown refresh needed.
function updatePlekPositie(rowIndex, xPct, yPct) {
  var sheet = ensurePlattegrondSheet();
  sheet.getRange(rowIndex, 3, 1, 2).setValues([[round1(xPct), round1(yPct)]]);
  return getAllePlekken();
}

// Renames a plek and cascades the change into every Config!Desk cell that
// held the old Label — see the file header for why this is the only place
// that needs to happen. Throws on a duplicate name (checked against every
// OTHER row) or an unknown rowIndex.
function renamePlek(rowIndex, newLabel) {
  newLabel = String(newLabel || '').trim();
  if (!newLabel) throw new Error('Naam mag niet leeg zijn.');

  var sheet = ensurePlattegrondSheet();
  var plekken = getAllePlekken();
  var plek = plekken.filter(function (p) { return p.rowIndex === rowIndex; })[0];
  if (!plek) throw new Error('Plek niet gevonden — herlaad de plattegrond en probeer opnieuw.');
  if (isLabelTaken(plekken, newLabel, rowIndex)) {
    throw new Error('Er bestaat al een plek met de naam "' + newLabel + '". Namen moeten uniek zijn.');
  }

  var oldLabel = plek.label;
  sheet.getRange(rowIndex, 2).setValue(newLabel);
  if (oldLabel && oldLabel !== newLabel) cascadeDeskRename(oldLabel, newLabel);
  return getAllePlekken();
}

// The ONLY place Config!Desk's label text gets rewritten outside of a user
// directly typing/picking in Config. Plain exact-match find-and-replace
// over the whole Desk column — deliberately not scoped to active topics
// only, a deactivated topic's Desk cell should stay consistent with the
// rest just as much as an active one's.
function cascadeDeskRename(oldLabel, newLabel) {
  var sheet = SpreadsheetApp.getActive().getSheetByName('Config');
  if (!sheet) return;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var range = sheet.getRange(2, 2, lastRow - 1, 1);
  var values = range.getValues();
  var changed = false;
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === oldLabel) {
      values[i][0] = newLabel;
      changed = true;
    }
  }
  if (changed) range.setValues(values);
}

function setPlekActief(rowIndex, actief) {
  var sheet = ensurePlattegrondSheet();
  sheet.getRange(rowIndex, 5).setValue(!!actief);
  return getAllePlekken();
}

// ---------- Entry points for the two different consumers ----------

// PlattegrondDialog.html (the tagging/management tool): every plek,
// including untagged (no X/Y yet) or deactivated ones, plus rowIndex so
// the dialog can address a specific row.
function getPlattegrondVoorBeheer() {
  return { image: getPlattegrondImageDataUrl(), plekken: getAllePlekken() };
}

// Checklist.html (visitor-facing): only active, actually-tagged plekken —
// nothing useful to show for one without a position yet. No rowIndex/
// PlekNr exposed, visitors never edit anything here.
function getPlattegrondVoorChecklist() {
  var plekken = getAllePlekken().filter(function (p) {
    return p.actief && p.x !== null && p.y !== null;
  });
  return {
    image: getPlattegrondImageDataUrl(),
    plekken: plekken.map(function (p) { return { label: p.label, x: p.x, y: p.y }; })
  };
}

function openPlattegrondBeheer() {
  ensurePlattegrondSheet();
  var html = HtmlService.createHtmlOutputFromFile('PlattegrondDialog')
    .setWidth(920)
    .setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, 'Plattegrond beheren');
}
