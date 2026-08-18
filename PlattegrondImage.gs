// ============================================================
// PLATTEGROND IMAGE — fetches the floor plan PNG from Drive at runtime
//    instead of embedding it in code. Expected location: a folder named
//    "res" in the SAME Drive folder as this Spreadsheet, containing a file
//    whose name matches the "Plattegrond afbeelding" row in Instellingen
//    (PLATTEGROND_IMAGE_NAME_KEY, Sheets.gs; default 'floorplan.png').
//    Looking it up by name in a folder relative to the Spreadsheet — rather
//    than a hardcoded Drive file ID — is what makes this portable: reusing
//    this project for a different office/context is just copying the
//    Sheet, dropping a new floor plan PNG under that same filename into
//    that Sheet's own "res" folder, and (if using a different filename)
//    updating one Instellingen row. No code change, no ID to hunt down.
//
//    That "res" folder is normally kept in sync automatically: the
//    Bitbucket Pipelines step for this project (see bitbucket-pipelines.yml
//    at the repo root, and Instructies.md step 9) POSTs
//    gmail-marketplace/res/<bestandsnaam> from Git — the actual source of
//    truth — to handleFloorplanSyncRequest() below after every deploy, so
//    the checked-in PNG is what ends up in Drive. Without that CI step set
//    up, the file needs to be dropped into "res" by hand instead.
// ============================================================

// Shared by the read path (getPlattegrondImageDataUrl) and the CI write
// path (handleFloorplanSyncRequest). creeer=true also creates the "res"
// folder if it's missing — only the CI path should do that: a missing
// folder on the READ path is a real setup problem that should surface as a
// loud error, not get silently papered over with an empty folder.
function getOrCreateResFolder_(creeer) {
  var parents = DriveApp.getFileById(SpreadsheetApp.getActive().getId()).getParents();
  if (!parents.hasNext()) {
    throw new Error('Deze Sheet staat niet in een Drive-map.');
  }
  var parentFolder = parents.next();
  var resFolders = parentFolder.getFoldersByName('res');
  if (resFolders.hasNext()) return resFolders.next();
  if (!creeer) {
    throw new Error('Geen map "res" naast deze Sheet in Drive.');
  }
  return parentFolder.createFolder('res');
}

function getPlattegrondImageDataUrl() {
  var bestandsnaam = getInstellingWaarde(PLATTEGROND_IMAGE_NAME_KEY) || 'floorplan.png';
  var resFolder = getOrCreateResFolder_(false);
  var files = resFolder.getFilesByName(bestandsnaam);
  if (!files.hasNext()) {
    throw new Error(
      'Plattegrond-afbeelding niet gevonden: geen bestand "' + bestandsnaam + '" in de "res"-map naast ' +
      'deze Sheet. Upload het bestand, of pas de "' + PLATTEGROND_IMAGE_NAME_KEY + '"-rij in Instellingen aan.'
    );
  }

  var blob = files.next().getBlob();
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

// CI-only write path, routed here from doPost() (Subscription.gs) via
// ?floorplanSync=<token>. Same "shared-secret Script Property, always HTTP
// 200, caller checks the JSON success field" idiom as
// handleSelfTestRequest() (SelfTests.gs) — see its comment for the reasoning
// (Apps Script Web Apps don't give reliable control over the actual HTTP
// transport status on an uncaught exception). base64Png arrives as the raw
// POST body (text/plain, base64-encoded PNG bytes) rather than a query
// param — the image is far too large for a GET URL/query string.
//
// Deliberately creates the "res" folder if missing (getOrCreateResFolder_,
// creeer=true) — CI is exactly the place that should be allowed to
// bootstrap it, since the PNG it's about to write arrives in this same
// call. Any existing file(s) under this name are trashed before creating
// the new one rather than overwritten in place, the simplest way to
// guarantee exactly one live file with this name afterwards regardless of
// how many stale/duplicate copies (manual uploads, earlier syncs) already
// existed.
function handleFloorplanSyncRequest(token, base64Png) {
  var expectedToken = PropertiesService.getScriptProperties().getProperty('FLOORPLAN_SYNC_TOKEN');
  if (!expectedToken || token !== expectedToken) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Invalid or missing token' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (!base64Png) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'No image data in request body' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var bestandsnaam = getInstellingWaarde(PLATTEGROND_IMAGE_NAME_KEY) || 'floorplan.png';
    var bytes = Utilities.base64Decode(base64Png);
    var blob = Utilities.newBlob(bytes, 'image/png', bestandsnaam);

    var resFolder = getOrCreateResFolder_(true);
    var existing = resFolder.getFilesByName(bestandsnaam);
    while (existing.hasNext()) existing.next().setTrashed(true);
    resFolder.createFile(blob);

    return ContentService.createTextOutput(JSON.stringify({ success: true, bytes: bytes.length }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
