// ============================================================
// SELF-TESTS — this codebase has now hit the exact same substring-
// collision bug TWICE, independently, in two different functions
// (getMyChecklist and syncAanmeldingenColumns), because the "is this
// person interested in this topic" question was answered in more than
// one place. isInterestedIn() is now the ONLY function allowed to answer
// that question from a raw answer list — these tests exist purely to
// make sure it (and it alone) never regresses back to a substring check.
//
// runSelfTests() (below) is the manual entry point: run it from the Apps
// Script editor — pick "runSelfTests" in the function dropdown next to
// the Run button, click Run, then check View > Execution log. A thrown
// error means a real regression.
//
// The actual assertions live in runSelfTestsCore(), kept UI-free (no
// SpreadsheetApp.getUi() call) on purpose: getUi() throws when there's no
// active editor UI, which rules out calling it from a trigger, a web app
// request, or an API call. Keeping the assertions UI-free means the same
// core function can later be called from a doGet()-based, secret-gated
// endpoint on the already-deployed web app — enabling a Bitbucket
// Pipelines step to invoke the self-tests and fail the build on a
// regression, without the extra GCP "Standard Cloud project + API
// executable deployment" setup that clasp run would require.
// ============================================================
function assertEqual_(actual, expected, message) {
  if (actual !== expected) {
    throw new Error('Self-test FAILED: ' + message + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
}

function runSelfTests() {
  var checks = runSelfTestsCore();
  Logger.log('runSelfTests: all ' + checks + ' assertions passed.');
  SpreadsheetApp.getUi().alert('Self-tests passed (' + checks + ' assertions). See View > Execution log for details.');
}

// CI entry point, routed here from doGet() (Subscription.gs) via
// ?selftest=<token>. Gated by a shared secret (Script Property
// SELFTEST_TOKEN) so this isn't a publicly callable "run arbitrary code"
// endpoint — anyone without the token gets a generic failure, never a
// stack trace or other internal detail. Always returns HTTP 200: Apps
// Script Web Apps don't give reliable control over the actual HTTP
// transport status code on an uncaught exception, so the caller (a
// Bitbucket Pipelines step) is expected to check the "success" field in
// the JSON body itself rather than the HTTP status.
function handleSelfTestRequest(token) {
  var expectedToken = PropertiesService.getScriptProperties().getProperty('SELFTEST_TOKEN');
  if (!expectedToken || token !== expectedToken) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Invalid or missing token' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  try {
    var checks = runSelfTestsCore();
    return ContentService.createTextOutput(JSON.stringify({ success: true, checks: checks }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function runSelfTestsCore() {
  var checks = 0;

  // The exact real-world collision that broke getMyChecklist() once and
  // syncAanmeldingenColumns() a second time: "...v1" is a literal text
  // prefix of "...v10"/"...v12", but a DIFFERENT topic.
  var v1 = { topic: 'Performance-verbeteringen v1', desk: 'Bureau 2C' };
  var v10 = { topic: 'Performance-verbeteringen v10', desk: 'Bureau 1A' };
  var v12 = { topic: 'Performance-verbeteringen v12', desk: 'Bureau 1A' };
  var pickedV10AndV12 = [topicChoiceLabel(v10), topicChoiceLabel(v12)]; // did NOT pick v1

  assertEqual_(isInterestedIn(pickedV10AndV12, v1), false, 'v1 must NOT match a raw answer that only contains v10/v12'); checks++;
  assertEqual_(isInterestedIn(pickedV10AndV12, v10), true, 'v10 must match its own exact label'); checks++;
  assertEqual_(isInterestedIn(pickedV10AndV12, v12), true, 'v12 must match its own exact label'); checks++;

  // Same collision shape with a short, common-word topic name.
  var api = { topic: 'API', desk: 'Bureau 1A' };
  var nieuweApi = { topic: 'Nieuwe API', desk: 'Bureau 1A' };
  var pickedNieuweApi = [topicChoiceLabel(nieuweApi)]; // did NOT pick "API"

  assertEqual_(isInterestedIn(pickedNieuweApi, api), false, '"API" must NOT match a raw answer that only contains "Nieuwe API"'); checks++;
  assertEqual_(isInterestedIn(pickedNieuweApi, nieuweApi), true, '"Nieuwe API" must match its own exact label'); checks++;

  // Same topic name at two different desks must not cross-match — the
  // desk is part of the choice label, not an afterthought.
  var deskA = { topic: 'Onboarding-flow', desk: 'Bureau 3B' };
  var deskB = { topic: 'Onboarding-flow', desk: 'Bureau 4C' };
  var pickedDeskA = [topicChoiceLabel(deskA)];

  assertEqual_(isInterestedIn(pickedDeskA, deskA), true, 'exact topic+desk combination must match'); checks++;
  assertEqual_(isInterestedIn(pickedDeskA, deskB), false, 'same topic name but a different desk must NOT match'); checks++;

  // Nobody picked anything for this topic at all.
  assertEqual_(isInterestedIn([], v1), false, 'an empty raw answer must never match anything'); checks++;

  // Regression guard for a real bug that slipped in while FIXING the above:
  // Range.insertCheckboxes() is documented to overwrite a cell's value to
  // its unchecked default — using it to add checkbox rendering to a cell
  // that already holds a real true/false answer would silently flip that
  // answer back to false. applyCheckboxValidation() (setDataValidation() +
  // requireCheckbox()) must never do that.
  var tempSheet = SpreadsheetApp.getActive().insertSheet('zzz_selftest_tmp');
  try {
    var cell = tempSheet.getRange('A1');
    cell.setValue(true);
    applyCheckboxValidation(cell);
    assertEqual_(cell.getValue(), true, 'applyCheckboxValidation() must NOT overwrite an existing true value — this is the exact regression Range.insertCheckboxes() caused'); checks++;
  } finally {
    SpreadsheetApp.getActive().deleteSheet(tempSheet);
  }

  // Jira column-mapping parsing: column name (left of "=") preserved
  // verbatim, path (right of "=") trimmed; entries missing either side
  // are dropped rather than producing a broken column.
  var mapping = parseJiraColumnMappingString('Titel=summary, Status = status.name ,Kapot=');
  assertEqual_(mapping.length, 2, 'parseJiraColumnMappingString must drop entries with no path'); checks++;
  assertEqual_(mapping[0].column, 'Titel', 'first column name must be preserved verbatim'); checks++;
  assertEqual_(mapping[1].path, 'status.name', 'path must be trimmed of surrounding whitespace'); checks++;

  // buildJiraJqlFrom: the optional project safety-net is only applied
  // when actually set — an empty "Jira project" must leave the filter's
  // own JQL scope completely untouched.
  assertEqual_(buildJiraJqlFrom('11791', ''), 'filter=11791', 'no project set -> filter scope alone, untouched'); checks++;
  assertEqual_(buildJiraJqlFrom('11791', 'ROB'), 'filter=11791 AND project=ROB', 'project set -> appended as an extra restriction'); checks++;

  // resolveJiraFieldPath: nested path resolution, missing/null
  // intermediate values -> '' (never throws), object leaf -> stringified.
  var issue = { fields: { summary: 'Fix bug', assignee: { displayName: 'Jane Doe' }, priority: null } };
  assertEqual_(resolveJiraFieldPath(issue, 'summary'), 'Fix bug', 'top-level field must resolve directly'); checks++;
  assertEqual_(resolveJiraFieldPath(issue, 'assignee.displayName'), 'Jane Doe', 'nested path must resolve through an object'); checks++;
  assertEqual_(resolveJiraFieldPath(issue, 'priority.name'), '', 'a null intermediate value must resolve to empty, not throw'); checks++;
  assertEqual_(resolveJiraFieldPath(issue, 'reporter.displayName'), '', 'a missing top-level field must resolve to empty, not throw'); checks++;
  assertEqual_(resolveJiraFieldPath(issue, 'assignee'), JSON.stringify({ displayName: 'Jane Doe' }), 'a path resolving to an object must fall back to JSON stringify'); checks++;

  // ADF (Atlassian Document Format) rich-text fields — e.g. a Paragraph
  // custom field like Release Notes — must resolve to plain, readable
  // text instead of raw ADF JSON. Live-confirmed shape (see
  // CLAUDE_CODE_CONTEXT.md): {type:"doc", content:[{type:"paragraph",
  // content:[{type:"text", text:"..."}]}]}, and multi-paragraph values
  // must join with a newline, not silently drop everything but the first.
  var issueWithAdf = { fields: { customfield_10166: {
    type: 'doc', version: 1,
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'First line.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Second line.' }] }
    ]
  } } };
  assertEqual_(resolveJiraFieldPath(issueWithAdf, 'customfield_10166'), 'First line. | Second line.', 'an ADF rich-text field must join multiple paragraphs with a non-newline separator — a literal "\\n" would balloon the Sheets row height regardless of the CLIP wrap strategy'); checks++;
  assertEqual_(extractPlainTextFromAdf({ foo: 'bar' }), null, 'a plain object that is not ADF-shaped must return null so the caller falls back to JSON.stringify'); checks++;

  var adfWithHardBreak = { type: 'doc', version: 1, content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Before' }, { type: 'hardBreak' }, { type: 'text', text: 'after' }] }
  ] };
  assertEqual_(extractPlainTextFromAdf(adfWithHardBreak), 'Before after', 'a manual line break (hardBreak) within one paragraph must become a space, not run words together with nothing between them'); checks++;

  // checkForUnknownJiraFields: flags configured fields that never
  // appeared in any issue; skipped entirely when there are zero issues
  // (an ambiguous case — nothing could ever "appear" against 0 results).
  var issuesForCheck = [{ fields: { summary: 'A' } }];
  var mappingForCheck = [{ column: 'Titel', path: 'summary' }, { column: 'Typo', path: 'asignee.displayName' }];
  assertEqual_(checkForUnknownJiraFields(issuesForCheck, mappingForCheck).length, 1, 'a configured field that never appears in any issue must be flagged'); checks++;
  assertEqual_(checkForUnknownJiraFields([], mappingForCheck).length, 0, 'zero issues is ambiguous — must not flag anything'); checks++;

  // resolveConfigRowFromJiraRow: only Topic/Desk/Beschrijving are ever
  // written (an unrecognized target column in the mapping is ignored,
  // not crashed on), and an unrecognized SOURCE column name is treated
  // the same way — left blank rather than throwing.
  var jiraHeader = ['Select', 'Key', 'Titel', 'Status'];
  var jiraRow = [false, '=HYPERLINK("https://x/browse/PROJ-1", "PROJ-1")', 'Fix the thing', 'In Progress'];
  var configMapping = parseJiraColumnMappingString('Topic=Titel, Beschrijving=Status, Actief=Titel');
  var resolved = resolveConfigRowFromJiraRow(configMapping, jiraHeader, jiraRow);
  assertEqual_(resolved.Topic, 'Fix the thing', 'Topic must be resolved from the mapped Jira tab column'); checks++;
  assertEqual_(resolved.Beschrijving, 'In Progress', 'Beschrijving must be resolved from its own mapped column'); checks++;
  assertEqual_(resolved.Desk, '', 'an unmapped Config column must stay blank, not crash'); checks++;
  assertEqual_(resolved.hasOwnProperty('Actief'), false, 'a mapping entry targeting an unrecognized Config column ("Actief") must be ignored'); checks++;

  var mappingWithTypo = parseJiraColumnMappingString('Topic=Titel, Desk=NietBestaandeKolom');
  var resolvedWithTypo = resolveConfigRowFromJiraRow(mappingWithTypo, jiraHeader, jiraRow);
  assertEqual_(resolvedWithTypo.Desk, '', 'a mapping entry referencing a non-existent Jira tab column must resolve to blank, not throw'); checks++;

  // isLabelTaken (Plattegrond.gs): must catch a duplicate regardless of
  // case/surrounding whitespace (Labels feed a visitor-facing dropdown —
  // "Team Rocket" and "team rocket " are the same desk), and must ignore
  // the row being compared against itself (renamePlek() re-checks the
  // FULL list including the row it's about to rename).
  var plekken = [
    { rowIndex: 2, label: 'Team Rocket' },
    { rowIndex: 3, label: 'Bureau 1A' }
  ];
  assertEqual_(isLabelTaken(plekken, ' team rocket ', -1), true, 'a duplicate label must be caught case-insensitively and trimmed'); checks++;
  assertEqual_(isLabelTaken(plekken, 'Bureau 2C', -1), false, 'a genuinely new label must not be flagged as taken'); checks++;
  assertEqual_(isLabelTaken(plekken, 'Team Rocket', 2), false, 'a row must not collide with its own current label when renaming'); checks++;
  assertEqual_(isLabelTaken(plekken, 'Bureau 1A', 2), true, 'renaming row 2 to another row\'s existing label must still be caught'); checks++;

  // nextPlekNr (Plattegrond.gs): PlekNr is a permanent, ever-increasing
  // number — never reused, even for an empty list or one with gaps
  // (a deactivated/never-cleaned-up plek must not free up its number).
  assertEqual_(nextPlekNr([]), 1, 'the first plek ever must get PlekNr 1'); checks++;
  assertEqual_(nextPlekNr([{ plekNr: 1 }, { plekNr: 3 }]), 4, 'next PlekNr must be one above the current highest, gaps included'); checks++;

  return checks;
}
