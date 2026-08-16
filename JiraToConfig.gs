// Menu entry point ("📥Copy selected to Config"). Copies every row whose
// "Select" checkbox is checked into Config, using "Jira naar Config"
// (ConfigColumn=JiraTabColumnName pairs, reusing the same parser as "Jira
// kolommen" — the pair-parsing logic is identical, only the meaning of
// the right-hand side differs: a Jira TAB column name here, a Jira API
// field path there) to decide which Jira tab column feeds which Config
// column. Unmapped Config columns (typically Desk — no natural Jira
// equivalent) are left blank; Actief always starts checked for a freshly
// copied row. Successfully copied rows get unchecked on the Jira tab
// afterwards, so a second click can't accidentally copy them again.
// Pure and testable (see runSelfTestsCore()): resolves one Config row
// ({Topic, Desk, Beschrijving}) from one Jira tab data row, given the
// parsed "Jira naar Config" mapping and that tab's header. Unrecognized
// target columns (a typo in the mapping) and unrecognized source column
// names are both silently ignored rather than crashing the whole copy.
function resolveConfigRowFromJiraRow(mapping, header, rowValues) {
  var configRow = { Topic: '', Desk: '', Beschrijving: '' };
  mapping.forEach(function (m) {
    if (!configRow.hasOwnProperty(m.column)) return;
    var sourceCol = header.indexOf(m.path);
    if (sourceCol > -1) configRow[m.column] = String(rowValues[sourceCol] || '');
  });
  return configRow;
}

function copyCheckedJiraItemsToConfig() {
  var jiraSheet = SpreadsheetApp.getActive().getSheetByName('Jira');
  if (!jiraSheet || jiraSheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('No Jira rows to copy yet — run "🔷Fetch from Jira" first.');
    return;
  }

  var data = jiraSheet.getRange(1, 1, jiraSheet.getLastRow(), jiraSheet.getLastColumn()).getValues();
  var header = data[0];
  var selectCol = header.indexOf('Select');
  if (selectCol === -1) {
    SpreadsheetApp.getUi().alert('Could not find the "Select" column on the Jira tab.');
    return;
  }

  var mapping = parseJiraColumnMappingString(getInstellingWaarde(JIRA_CONFIG_MAPPING_KEY));
  var configSheet = ensureConfigSheet();
  var copiedCount = 0;

  for (var r = 1; r < data.length; r++) {
    if (data[r][selectCol] !== true) continue;

    var configRow = resolveConfigRowFromJiraRow(mapping, header, data[r]);
    configSheet.appendRow([configRow.Topic, configRow.Desk, configRow.Beschrijving, true]);
    // appendRow() writes a plain boolean — applyCheckboxValidation(), not
    // insertCheckboxes(), same value-preserving reasoning as everywhere
    // else that writes a fresh checkbox cell in this file.
    applyCheckboxValidation(configSheet.getRange(configSheet.getLastRow(), 4));

    jiraSheet.getRange(r + 1, selectCol + 1).setValue(false);
    copiedCount++;
  }

  if (!copiedCount) {
    SpreadsheetApp.getUi().alert('No rows were checked on the Jira tab — nothing to copy.');
    return;
  }
  // appendRow() writes plain values with the sheet's default font —
  // reapply Montserrat to the whole tab so copied rows match everything
  // else, same "always reapply" idiom as every other ensure*/write*
  // function in this file.
  applyBrandFont(configSheet);
  SpreadsheetApp.getUi().alert(copiedCount + ' item(s) copied to Config. Fill in "Desk" manually if needed.');
}
