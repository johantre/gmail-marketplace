// ============================================================
// CORE — shared helpers used across multiple files: settings, the menu
//    (onOpen), Config reading, Drive helpers, checkbox/brand styling, and
//    the Links tab (logLink/getLastLoggedLink). See Code.gs for the
//    one-time Script Properties setup this getSettings() reads.
// ============================================================
function getSettings() {
  var props = PropertiesService.getScriptProperties();
  return {
    slidesTemplateId: props.getProperty('SLIDES_TEMPLATE_ID'),
    formId: props.getProperty('FORM_ID'),
    driveFolderId: props.getProperty('DRIVE_FOLDER_ID'),
    archiveSpreadsheetId: props.getProperty('ARCHIVE_SPREADSHEET_ID'),
    webappUrl: props.getProperty('WEBAPP_URL'),
    jiraOAuthClientId: props.getProperty('JIRA_OAUTH_CLIENT_ID'),
    jiraOAuthClientSecret: props.getProperty('JIRA_OAUTH_CLIENT_SECRET')
  };
}

// Title of the form's topics question — fixed here so generateForm() and
// onFormSubmitHandler() always look for the same question item.
var CHECKBOX_TITLE = 'Welke topics wil je bezoeken?';

// ---------- Menu in the Sheet ----------
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🛍️Marketplace tools')
    .addItem('📋Sheet structure setup/rebuild', 'setupSheetStructure')
    .addItem('🗺️Plattegrond beheren', 'openPlattegrondBeheer')
    .addItem('🔄 Sync topics Subscription form', 'generateForm')
    .addItem('🖥️Generate Presentation', 'generateSlides')
    .addItem('🔁 Regenerate Checklist QR', 'showChecklistLink')
    .addItem('🏛️Archive results', 'archiveAndResetCycle')
    .addItem('🔷Fetch from Jira', 'fetchFromJira')
    .addItem('📥Copy selected to Config', 'copyCheckedJiraItemsToConfig')
    .addToUi();
}

// ---------- Reading Config ----------
// Expects a "Config" tab with columns: Topic | Desk | Beschrijving | Actief (checkbox)
function getActiveTopics() {
  var sheet = SpreadsheetApp.getActive().getSheetByName('Config');
  var rows = sheet.getDataRange().getValues();
  var topics = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (r[0] && r[3] === true) {
      topics.push({ topic: String(r[0]), desk: String(r[1] || ''), beschrijving: String(r[2] || '') });
    }
  }
  return topics;
}

function topicChoiceLabel(t) {
  return t.topic + ' (' + t.desk + ')';
}

// THE single place that decides whether a raw list of checked form choices
// counts as "interested in topic t". Always an EXACT match against the full
// choice label (never a substring check) — a substring check re-opens the
// exact collision bug this codebase already got bitten by twice (e.g.
// "Performance-verbeteringen v1" is a literal prefix of "...v10 (Bureau
// 1A)..."/"...v12..."). Every other place that needs this answer (Dashboard,
// getMyChecklist) must read the already-computed Interesse_<topic> column
// instead of ever re-deriving it — see runSelfTestsCore() in SelfTests.gs.
function isInterestedIn(interesseRawArray, t) {
  return interesseRawArray.indexOf(topicChoiceLabel(t)) !== -1;
}

// Best-effort move to DRIVE_FOLDER_ID (purely for tidiness, not a functional
// requirement). DriveApp's addFile/removeFile mechanism doesn't work on
// folders in a Shared Drive ("Cannot use this operation on a shared drive
// item") — not fatal: on failure the file just stays in "My Drive", and the
// rest of the action continues normally.
function moveFileToDriveFolder(file, folderId) {
  if (!folderId) return;
  try {
    DriveApp.getFolderById(folderId).addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  } catch (err) {
    Logger.log('Could not move file to Drive folder ' + folderId + ' (staying in My Drive): ' + err);
  }
}

// For COPIES of an existing file (generateSlides()): creates the copy
// directly inside the target folder via makeCopy(name, folder), instead of
// copying first and then moving. Live-confirmed root cause of
// moveFileToDriveFolder()'s Shared Drive failure for Slides specifically:
// makeCopy(name) alone places the copy in the SAME parent as the source
// file — if the template itself already lives inside the Shared Drive,
// the copy is a Shared-Drive-resident file from the moment it's created,
// and the old addFile()/removeFile() "move" step can never touch it
// (that legacy API doesn't support Shared Drive items at all). Creating
// the copy with the destination folder specified up front sidesteps that
// entirely. Falls back to the old copy-then-move approach (and ultimately
// to a plain copy in "My Drive") if this ever fails for some other reason
// — never allowed to block the actual presentation from being generated.
function makeCopyInDriveFolder(sourceFile, name, folderId) {
  if (!folderId) return sourceFile.makeCopy(name);
  try {
    return sourceFile.makeCopy(name, DriveApp.getFolderById(folderId));
  } catch (err) {
    Logger.log('makeCopyInDriveFolder: could not create the copy directly in Drive folder ' + folderId + ', falling back to copy + move: ' + err);
    var copy = sourceFile.makeCopy(name);
    moveFileToDriveFolder(copy, folderId);
    return copy;
  }
}

// Makes a range render as a checkbox WITHOUT touching its current value.
// Deliberately NOT Range.insertCheckboxes() — that convenience method is
// documented (and confirmed live) to also OVERWRITE every cell in the
// range to its unchecked default, i.e. it would silently flip a real
// Interesse_<topic>/Bezocht_<topic> = true back to false the moment it's
// (re)applied. setDataValidation() only attaches the validation/rendering
// rule, exactly like using Data > Data validation in the Sheets UI on
// cells that already have content — it never alters the value. Use this
// everywhere checkbox rendering needs to be (re)applied to a cell that may
// already hold a real answer; insertCheckboxes() stays fine only for
// brand-new cells being deliberately initialized to false in the same breath.
function applyCheckboxValidation(range) {
  range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
}

// ---------- Brand style (Montserrat + dark header bar) ----------
var BRAND_FONT = 'Montserrat';
var BRAND_HEADER_BG = '#1F3864';
var BRAND_HEADER_FG = '#FFFFFF';
var BRAND_DONE_COLOR = '#34A853'; // positive green for "done"
var BRAND_TODO_COLOR = '#E0E0E0'; // neutral gray for "to do"
var BRAND_NONE_COLOR = '#EA9999'; // pastel red for "no signups yet" (not the same as "fully done")

// Styles a header row (dark background, white bold text, Montserrat) —
// idempotent, so safe to call again anytime, even on a header row rebuilt
// via sheet.clear() (e.g. Dashboard).
function styleHeaderRow(sheet, numCols) {
  if (!sheet || numCols < 1) return;
  sheet.getRange(1, 1, 1, numCols)
    .setBackground(BRAND_HEADER_BG)
    .setFontColor(BRAND_HEADER_FG)
    .setFontWeight('bold')
    .setFontFamily(BRAND_FONT);
}

// Sets Montserrat on all currently used cells of a tab (separate from the
// header style above, which only touches the first row).
function applyBrandFont(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow > 0 && lastCol > 0) {
    sheet.getRange(1, 1, lastRow, lastCol).setFontFamily(BRAND_FONT);
  }
}

// ---------- Links tab (audit trail of every generated link) ----------
function logLink(label, url) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName('Links') || ss.insertSheet('Links');
  sheet.appendRow([new Date(), label, url]);
}

// Finds the most recently logged link with this label in the existing
// Links tab (see logLink()) — no separate state kept for the archive metadata.
function getLastLoggedLink(label) {
  var sheet = SpreadsheetApp.getActive().getSheetByName('Links');
  if (!sheet) return '';
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if (rows[i][1] === label) return rows[i][2];
  }
  return '';
}
