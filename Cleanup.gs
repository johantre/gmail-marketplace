function resetForNextCycle() {
  var sheet = SpreadsheetApp.getActive().getSheetByName('Aanmeldingen');
  var lastRow = sheet.getLastRow();
  // deleteRows(), NOT clearContent(): clearContent() only wipes values and
  // leaves formatting/data-validation (checkbox rules) in place — and
  // getLastRow() counts a row as "used" if it has EITHER, even with no
  // value. That left a permanently-growing gap of blank "ghost" rows after
  // every archive/reset (appendRow() kept skipping past them for the next
  // real signup). Deleting the rows outright removes them completely, so
  // the next signup correctly lands right after the header again.
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
  ensureDashboard();

  var settings = getSettings();
  if (settings.formId) {
    FormApp.openById(settings.formId).deleteAllResponses();
  }
}
