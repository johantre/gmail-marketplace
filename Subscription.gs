// ============================================================
// SUBSCRIPTION FORM + CHECKLIST WEBAPP — the same link/QR stays valid,
//    only the choices get synced with Config. showChecklistLink() sets up
//    the link/QR for the webapp below; doGet()/getMyChecklist()/
//    setBezocht() are the webapp itself (Checklist.html), called by
//    everyone from their phone during the Review. logLink()/
//    getLastLoggedLink() live in Core.gs — shared with Slides generation.
// ============================================================

// Makes sure there's exactly one installable onFormSubmit trigger on this
// specific form (idempotent — clicking "🔄 Sync topics Subscription form"
// multiple times should never stack duplicate triggers).
function ensureFormSubmitTrigger(form) {
  var alreadyInstalled = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'onFormSubmitHandler' && t.getTriggerSourceId() === form.getId();
  });
  if (!alreadyInstalled) {
    ScriptApp.newTrigger('onFormSubmitHandler').forForm(form).onFormSubmit().create();
  }
}

// Despite the menu label, this never actually needs a NEW link: the same
// Form object (FORM_ID) is reused forever, so its URL never changes across
// cycles — same permanent-link model as the Checklist webapp. What DOES
// need to happen every cycle is re-syncing the checkbox choices with
// Config, since (unlike the Checklist webapp) a Google Form can't build
// its questions dynamically per visit — the choice values have to be
// explicitly re-set whenever Config's active topics change.
function generateForm() {
  var topics = getActiveTopics();
  if (!topics.length) {
    SpreadsheetApp.getUi().alert('No active topics in Config. Check at least one row under "Actief" before generating a form.');
    return;
  }

  var settings = getSettings();
  var form;
  var shortUrl;

  if (settings.formId) {
    form = FormApp.openById(settings.formId);
    shortUrl = getLastLoggedLink('Inschrijfformulier');
  } else {
    form = FormApp.create('Sprint Review Marketplace — Inschrijving');
    PropertiesService.getScriptProperties().setProperty('FORM_ID', form.getId());
    form.setLimitOneResponsePerUser(true);
    // FormApp.create() always lands in the My Drive ROOT of whoever
    // happens to run this the very first time — moved into DRIVE_FOLDER_ID
    // immediately so the Form is never left owned by one person's personal
    // account (live-confirmed problem: it stayed there until manually
    // dragged into the Shared Drive). DriveApp's addFile()/removeFile()
    // (used by moveFileToDriveFolder(), Core.gs) doesn't support Shared
    // Drives at all — same limitation that affected the Slides copy
    // earlier, worked around there via makeCopy(name, folder) instead of a
    // move, which isn't an option here (a Form can't be created directly
    // inside a folder). The Advanced Drive Service's addParents/
    // removeParents + supportsAllDrives is the confirmed-correct way to
    // move a file into a genuine Shared Drive.
    if (settings.driveFolderId) {
      try {
        Drive.Files.update({}, form.getId(), null, {
          addParents: settings.driveFolderId,
          removeParents: 'root',
          supportsAllDrives: true
        });
      } catch (err) {
        Logger.log('generateForm: could not move the Subscription form into DRIVE_FOLDER_ID, it stays in My Drive: ' + err);
      }
    }
    // shortenFormUrl() mints a brand NEW forms.gle short link every time
    // it's called — live-confirmed: short links from earlier cycles keep
    // working forever, they're never reused/replaced. So this must only
    // ever run ONCE, at creation; calling it again on every sync would
    // silently pile up an ever-growing set of live short links all
    // pointing at the same form.
    shortUrl = form.shortenFormUrl(form.getPublishedUrl()); // forms.gle/...
  }
  // Logged on EVERY sync (not just at creation) — same audit-trail idiom
  // as showChecklistLink(), a dated record of "topics were synced on this
  // date", reusing the same shortUrl each time. Distinct from the
  // shortenFormUrl() call above, which stays creation-only: THAT is what
  // mints a new external forms.gle link, this just appends a plain row.
  logLink('Inschrijfformulier', shortUrl);
  // "Verified" email collection (auto-filled/locked to the signed-in
  // Google account, any account — not Acme-specific) is set up manually
  // once via the Forms web editor (Settings > Responses > Collect email
  // addresses), NOT here: FormApp.setCollectEmail() only toggles collection
  // on/off, it has no way to choose the collection TYPE (Verified vs
  // Responder input) — that's a separate field the Apps Script Forms
  // service doesn't expose at all (confirmed: only reachable via the
  // Forms REST API's Info.emailCollectionType, requiring a Standard Cloud
  // project). setCollectEmail(true) here only guards against email
  // collection ever ending up fully OFF; it does not reset an
  // already-Verified setting back to manual (they're unrelated fields).
  form.setCollectEmail(true);

  // One-time cleanup for a form created before the "Naam" question was
  // removed (2026-08-15): the question is never re-added going forward
  // (see above), but an EXISTING one wouldn't disappear on its own — a
  // form's items only ever change when this code explicitly touches them.
  form.getItems(FormApp.ItemType.TEXT).forEach(function (i) {
    if (i.getTitle() === 'Naam') form.deleteItem(i);
  });

  var choiceLabels = topics.map(topicChoiceLabel);
  var checkboxItems = form.getItems(FormApp.ItemType.CHECKBOX);
  var item = checkboxItems.length
    ? checkboxItems[0].asCheckboxItem()
    : form.addCheckboxItem().setTitle(CHECKBOX_TITLE);
  item.setChoiceValues(choiceLabels);
  item.setRequired(true);

  ensureFormSubmitTrigger(form);
  syncAanmeldingenColumns();
  ensureDashboard();
  // Reapplied every time regardless of whether shortUrl is new or reused —
  // same "always reapply" idiom as styleHeaderRow/applyBrandFont elsewhere.
  // Friendly label for visual consistency with the Checklist's own link
  // cell (which needs one, its URL is long) — this one's already short,
  // but a matching label style looks less inconsistent than mixing a
  // raw URL here with a label there.
  setQrCodeFormula(QR_SUBSCRIPTION_COL, shortUrl, 'Open Subscription form');

  SpreadsheetApp.getUi().alert(
    'Subscription form topics synced.\n\nLink: ' + shortUrl +
    '\n\nQR code: see tab "QR-codes", cell B3 (clickable link in B4).'
  );
}

// Called by the installable onFormSubmit trigger (see
// ensureFormSubmitTrigger). Reads directly from the FormResponse object
// instead of relying on an auto-generated response sheet: that makes this
// independent of language/locale differences in Google's own column
// headers (e.g. "Email Address" instead of "E-mail").
function onFormSubmitHandler(e) {
  // Same lock as archiveAndResetCycle(): prevents a submission from
  // getting lost if it interleaves with a running archive/reset action.
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var response = e.response;
    var email = response.getRespondentEmail() || '';
    var interesseRaw = [];

    response.getItemResponses().forEach(function (ir) {
      var title = ir.getItem().getTitle();
      if (title === CHECKBOX_TITLE) {
        var answer = ir.getResponse();
        interesseRaw = Array.isArray(answer) ? answer : [answer];
      }
    });

    syncAanmeldingenColumns(); // catches topics added to Config after the last form update

    var sheet = SpreadsheetApp.getActive().getSheetByName('Aanmeldingen');
    var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var row = new Array(header.length).fill('');

    row[header.indexOf('Timestamp')] = new Date();
    row[header.indexOf('E-mail')] = email;
    row[header.indexOf('Interesse (ruw)')] = interesseRaw.join(', ');

    var topicCols = [];
    getActiveTopics().forEach(function (t) {
      var interested = isInterestedIn(interesseRaw, t);
      var iCol = header.indexOf('Interesse_' + t.topic);
      var bCol = header.indexOf('Bezocht_' + t.topic);
      if (iCol > -1) { row[iCol] = interested; topicCols.push(iCol); }
      if (bCol > -1) { row[bCol] = false; topicCols.push(bCol); }
    });

    sheet.appendRow(row);

    // appendRow() writes plain true/false values with no data validation of
    // its own, so without this the new row would show as plain "TRUE"/
    // "FALSE" text forever instead of a checkbox (see the matching note in
    // syncAanmeldingenColumns, which only heals rows that already existed
    // BEFORE this call — never the one just appended here). Uses
    // applyCheckboxValidation(), NOT insertCheckboxes() — the latter
    // OVERWRITES the cell to its unchecked default, which would silently
    // flip a real "interested" answer back to false the instant after
    // writing it.
    var newRow = sheet.getLastRow();
    topicCols.forEach(function (col) {
      applyCheckboxValidation(sheet.getRange(newRow, col + 1));
    });
  } finally {
    lock.releaseLock();
  }
}

function showChecklistLink() {
  var settings = getSettings();
  if (!settings.webappUrl) {
    SpreadsheetApp.getUi().alert(
      'WEBAPP_URL is not set yet.\n\n' +
      'Deploy the web app first (Implementeren > Nieuwe implementatie), copy the ' +
      '/exec URL, and set it as Script property "WEBAPP_URL" (Projectinstellingen ' +
      '> Script properties). See Instructies.md step 6 — this is deliberately NOT ' +
      'automatic, see the note above getSettings() in Core.gs.'
    );
    return;
  }
  logLink('Checklist', settings.webappUrl);
  // Friendly label, not the raw URL itself — no actual shortening involved
  // (Google's own general-purpose URL shortener has been discontinued for
  // years; a third-party one would add an external dependency for a purely
  // cosmetic nicety), just a nicer link text than the long /exec URL.
  setQrCodeFormula(QR_CHECKLIST_COL, settings.webappUrl, 'Open Checklist');
  SpreadsheetApp.getUi().alert(
    'Checklist QR regenerated.\n\nLink: ' + settings.webappUrl +
    '\n\nQR code: see tab "QR-codes", cell G3 (clickable link in G4).'
  );
}

// ?selftest=<token> routes to the CI self-test endpoint (see
// handleSelfTestRequest() in SelfTests.gs) instead of the Checklist page —
// checked first since it's a distinct, secret-gated concern unrelated to
// the checklist webapp routing below.
function doGet(e) {
  if (e.parameter.selftest) {
    return handleSelfTestRequest(e.parameter.selftest);
  }
  return HtmlService.createTemplateFromFile('Checklist').evaluate()
    .setTitle('Mijn Marketplace checklist')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Called from Checklist.html. First tries to recognize the logged-in
// Workspace user; falls back to a manual email address (needed once
// external users get access, without changing this function).
function getMyChecklist(manualEmail) {
  var email = Session.getActiveUser().getEmail() || manualEmail;
  if (!email) return { needsEmail: true };

  var sheet = SpreadsheetApp.getActive().getSheetByName('Aanmeldingen');
  var data = sheet.getDataRange().getValues();
  var header = data[0];
  var emailCol = header.indexOf('E-mail');

  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][emailCol] || '').toLowerCase() === email.toLowerCase()) {
      rowIndex = i;
      break;
    }
  }
  if (rowIndex === -1) return { needsEmail: true, notFound: true };

  // Read the already-exact-matched Interesse_<topic> boolean column
  // (computed once at signup by onFormSubmitHandler) instead of a
  // substring search on the raw "Interesse (ruw)" text — a substring check
  // here would wrongly match "Performance-verbeteringen v1" against
  // "...v10 (Bureau 1A)..." etc., since v1 is a literal prefix of v10/v12/....
  var items = getActiveTopics()
    .filter(function (t) {
      var col = header.indexOf('Interesse_' + t.topic);
      return col > -1 && data[rowIndex][col] === true;
    })
    .map(function (t) {
      var col = header.indexOf('Bezocht_' + t.topic);
      return {
        topic: t.topic,
        desk: t.desk,
        bezocht: col > -1 ? data[rowIndex][col] === true : false
      };
    });

  return { email: email, rowIndex: rowIndex + 1, items: items };
}

// Called as soon as someone checks/unchecks a box on their phone.
function setBezocht(rowIndex, topic, value) {
  var sheet = SpreadsheetApp.getActive().getSheetByName('Aanmeldingen');
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var col = header.indexOf('Bezocht_' + topic) + 1;
  if (col <= 0) return false;

  // Guard against marking a topic "bezocht" for someone who was never
  // actually "Interesse_<topic>" for it (this data crosses a real trust
  // boundary — it comes straight from the client browser). Prevents a
  // repeat of the earlier getMyChecklist substring-collision bug from
  // corrupting Dashboard counts (Bezocht > Ingeschreven -> negative
  // "Nog te doen") even if the client somehow requests it again.
  var interesseCol = header.indexOf('Interesse_' + topic);
  if (interesseCol > -1 && sheet.getRange(rowIndex, interesseCol + 1).getValue() !== true) {
    return false;
  }

  var cell = sheet.getRange(rowIndex, col);
  cell.setValue(value);
  // Belt-and-suspenders alongside the fixes in onFormSubmitHandler/
  // syncAanmeldingenColumns: guarantees this exact cell renders as a
  // checkbox (not plain "TRUE"/"FALSE" text) even if it's ever toggled
  // before either of those had a chance to apply the validation to it.
  // applyCheckboxValidation(), NOT insertCheckboxes() — called AFTER
  // setValue() here on purpose, but insertCheckboxes() would still
  // OVERWRITE the value to its unchecked default regardless of order,
  // silently undoing the setValue() above.
  applyCheckboxValidation(cell);
  return true;
}
