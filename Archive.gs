// ============================================================
// ARCHIVE & RESET — Config, the Form and the Slides template stay
//    permanent mother-artifacts (just like the Slides template already is
//    today). Only the results of the past cycle (Aanmeldingen, Dashboard,
//    Form responses) get archived and reset, so the same mother is
//    immediately ready for the next Review. See Cleanup.gs for
//    resetForNextCycle(), and Core.gs for moveFileToDriveFolder()/
//    getLastLoggedLink(), both shared with Slides generation.
// ============================================================
function archiveAndResetCycle() {
  var ui = SpreadsheetApp.getUi();
  var confirm = ui.alert(
    'Archive and reset',
    'This archives the current Aanmeldingen and Dashboard numbers to the ' +
    'archive file, then clears them for the next Review (including Form ' +
    'responses). Config, the Form and the Slides template are kept. ' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var archiveUrl = archiveCurrentCycle();
    resetForNextCycle();
    ui.alert(
      'Done.\n\nArchive: ' + archiveUrl +
      '\n\nAanmeldingen, Dashboard and the Form are ready for the next Review.'
    );
  } finally {
    lock.releaseLock();
  }
}

// Reads Dashboard/Aanmeldingen as evaluated values (not as formulas —
// otherwise the COUNTIFs would reference nothing after the reset) and
// writes them to two new tabs in the archive spreadsheet.
function archiveCurrentCycle() {
  var ss = SpreadsheetApp.getActive();
  var dashboardSheet = ss.getSheetByName('Dashboard');
  var aanmeldingenSheet = ss.getSheetByName('Aanmeldingen');
  var dashboardValues = dashboardSheet.getDataRange().getValues();
  var aanmeldingenValues = aanmeldingenSheet.getDataRange().getValues();

  var archiveSs = SpreadsheetApp.openById(ensureArchiveSpreadsheetId());
  var label = Utilities.formatDate(new Date(), 'Europe/Brussels', 'yyyy-MM-dd HHmm');
  var dashboardTabName, aanmeldingenTabName, suffix = 0;
  do {
    suffix++;
    var tag = suffix === 1 ? label : label + ' (' + suffix + ')';
    dashboardTabName = tag + ' — Dashboard';
    aanmeldingenTabName = tag + ' — Aanmeldingen';
  } while (archiveSs.getSheetByName(dashboardTabName));

  // insertSheet() already appends at the end by default, but moveActiveSheet()
  // (insertSheet's result is the active sheet) forces the position explicitly
  // — guarantees each new cycle's pair lands chronologically last regardless
  // of any earlier manual tab reordering in this archive spreadsheet.
  var dashboardArchiveSheet = archiveSs.insertSheet(dashboardTabName);
  archiveSs.moveActiveSheet(archiveSs.getNumSheets());
  dashboardArchiveSheet.getRange(1, 1, 1, 2).setValues([['Formulier', getLastLoggedLink('Inschrijfformulier')]]);
  dashboardArchiveSheet.getRange(2, 1, 1, 2).setValues([['Presentatie', getLastLoggedLink('Presentatie')]]);
  dashboardArchiveSheet.getRange(4, 1, dashboardValues.length, dashboardValues[0].length).setValues(dashboardValues);

  var aanmeldingenArchiveSheet = archiveSs.insertSheet(aanmeldingenTabName);
  archiveSs.moveActiveSheet(archiveSs.getNumSheets());
  aanmeldingenArchiveSheet.getRange(1, 1, aanmeldingenValues.length, aanmeldingenValues[0].length).setValues(aanmeldingenValues);

  // Clean up a leftover empty default tab (only present right after
  // creating the archive spreadsheet in ensureArchiveSpreadsheetId()).
  archiveSs.getSheets().forEach(function (s) {
    if (s.getName() !== dashboardTabName && s.getName() !== aanmeldingenTabName && s.getLastRow() === 0) {
      archiveSs.deleteSheet(s);
    }
  });

  return archiveSs.getUrl();
}

// Creates the permanent archive spreadsheet once (Script property
// ARCHIVE_SPREADSHEET_ID) and reuses it every time after.
function ensureArchiveSpreadsheetId() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('ARCHIVE_SPREADSHEET_ID');
  if (id && archiveFileStillValid(id)) return id;

  var archiveSs = SpreadsheetApp.create('Sprint Review Marketplace — archief');
  moveFileToDriveFolder(DriveApp.getFileById(archiveSs.getId()), props.getProperty('DRIVE_FOLDER_ID'));
  props.setProperty('ARCHIVE_SPREADSHEET_ID', archiveSs.getId());
  return archiveSs.getId();
}

// Live-confirmed failure mode this guards against: deleting/trashing the
// archive spreadsheet (e.g. to clean up too many test tabs) left the
// cached ARCHIVE_SPREADSHEET_ID Script Property pointing at a file that
// no longer shows up in Drive — but Drive still allows reading/writing a
// TRASHED file via its ID for a while, so archiveCurrentCycle() kept
// silently writing new tabs into that now-hidden file instead of
// creating a fresh one. No error was ever shown; the archive just
// appeared to do nothing. This check forces a fresh spreadsheet (and
// Script Property) the moment the cached one is gone or trashed.
function archiveFileStillValid(id) {
  try {
    return !DriveApp.getFileById(id).isTrashed();
  } catch (err) {
    return false; // permanently deleted, or never existed
  }
}
