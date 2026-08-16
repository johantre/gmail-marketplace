// ============================================================
// JIRA IMPORT — JQL, field-mapping and Sheet-writing for the "🔷Fetch
//    from Jira" feature. See JiraAuth.gs for the OAuth 2.0 (3LO)
//    permissions layer (per-user Atlassian authorization) that everything
//    here builds on top of, and JiraToConfig.gs for copying a fetched row
//    into Config.
// ============================================================

// Parses "Jira kolommen" (e.g. "Titel=summary, Status=status.name, ...")
// into an ordered list of {column, path} objects. The column name (left
// of "=") becomes the Sheet header, verbatim, in the user's own words —
// the path (right of "=") is used both to derive which top-level Jira
// field to request (fields=) and to pull the actual value out of each
// returned issue (see resolveJiraFieldPath). Split into a thin
// Instellingen-reading wrapper and a pure, testable parser (see
// runSelfTestsCore() in SelfTests.gs).
function parseJiraColumnMapping() {
  return parseJiraColumnMappingString(getInstellingWaarde(JIRA_KOLOMMEN_KEY));
}

function parseJiraColumnMappingString(raw) {
  return raw.split(',').map(function (pair) {
    var parts = pair.split('=');
    return { column: parts[0].trim(), path: (parts[1] || '').trim() };
  }).filter(function (m) { return m.column && m.path; });
}

// Combines "Jira filter ID" with the optional "Jira project" safety-net
// setting into the JQL actually sent to Jira. Empty "Jira project" leaves
// the filter's own saved JQL scope untouched — a filter with no project
// clause searching across every accessible project is expected behavior,
// not a bug (see CLAUDE_CODE_CONTEXT.md). Split the same way as
// parseJiraColumnMapping for testability.
function buildJiraJql() {
  return buildJiraJqlFrom(getInstellingWaarde(JIRA_FILTER_ID_KEY), getInstellingWaarde(JIRA_PROJECT_KEY));
}

function buildJiraJqlFrom(filterId, project) {
  var jql = 'filter=' + filterId;
  if (project) jql += ' AND project=' + project;
  return jql;
}

function runJiraFetch(service) {
  var filterId = getInstellingWaarde(JIRA_FILTER_ID_KEY);
  if (!filterId) {
    SpreadsheetApp.getUi().alert('"Jira filter ID" is not filled in yet in Instellingen.');
    return;
  }

  var columnMapping = parseJiraColumnMapping();
  if (!columnMapping.length) {
    SpreadsheetApp.getUi().alert('"Jira kolommen" in Instellingen is empty or invalid — expected format: "ColumnName=jiraField, ...".');
    return;
  }

  var maxItemsSetting = parseInt(getInstellingWaarde(MAX_JIRA_ITEMS_KEY), 10);
  var maxItems = (!isNaN(maxItemsSetting) && maxItemsSetting > 0) ? maxItemsSetting : 20;

  var siteInfo = getJiraSiteInfo(service);
  // Only the TOP-LEVEL segment of each path is a real Jira field key —
  // "assignee.displayName" needs "assignee" requested via fields=, the
  // rest of the path is resolved locally out of the returned object.
  var fieldKeys = columnMapping.map(function (m) { return m.path.split('.')[0]; });
  var uniqueFieldKeys = fieldKeys.filter(function (key, i) { return fieldKeys.indexOf(key) === i; });

  // /rest/api/3/search (GET, "total" count) is confirmed REMOVED by
  // Atlassian (HTTP 410, live-confirmed 2026-08-15) — migrated to
  // /rest/api/3/search/jql, which drops the "total" count entirely and
  // instead returns "isLast" (true once there are no more matching
  // issues beyond this page). See CLAUDE_CODE_CONTEXT.md.
  var searchUrl = 'https://api.atlassian.com/ex/jira/' + siteInfo.cloudId + '/rest/api/3/search/jql'
    + '?jql=' + encodeURIComponent(buildJiraJql())
    + '&maxResults=' + maxItems
    + '&fields=' + encodeURIComponent(uniqueFieldKeys.join(','));

  var response = UrlFetchApp.fetch(searchUrl, {
    headers: { Authorization: 'Bearer ' + service.getAccessToken() },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) {
    throw new Error('Jira request failed (status ' + response.getResponseCode() + '): ' + response.getContentText());
  }

  var result = JSON.parse(response.getContentText());
  var issues = result.issues || [];
  var truncated = result.isLast === false;

  writeJiraIssuesToSheet(issues, columnMapping, truncated, siteInfo.siteUrl);

  var unknownFields = checkForUnknownJiraFields(issues, columnMapping);
  var message = 'Jira tab updated: ' + issues.length + ' issue(s)'
    + (truncated ? ' (there are more results — raise "Max Jira items" in Instellingen for more; Jira no longer reports an exact total since the newer search API)' : '') + '.';
  if (unknownFields.length) {
    message += '\n\nNote: these columns never appeared in any issue (typo in "Jira kolommen"?): ' + unknownFields.join(', ');
  }
  SpreadsheetApp.getUi().alert(message);
}

// Idempotent tab creator (called from setupSheetStructure(), same
// "always create + always restyle" idiom as ensureQrCodesSheet()) — also
// reapplies the header every time so a changed "Jira kolommen" setting
// is reflected without waiting for the next fetch. "Select" is the first
// column — a checkbox per row, read by copyCheckedJiraItemsToConfig().
function ensureJiraSheet() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName('Jira') || ss.insertSheet('Jira');
  var columnMapping = parseJiraColumnMapping();
  // No separate "Link" column — "Key" itself is a =HYPERLINK() formula
  // (see writeJiraIssuesToSheet()), showing the key as clickable text.
  var headers = ['Select', 'Key'].concat(columnMapping.map(function (m) { return m.column; }));
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  sheet.setRowHeight(1, JIRA_ROW_HEIGHT_PIXELS);
  sheet.setFrozenRows(1);
  styleHeaderRow(sheet, headers.length);
  applyBrandFont(sheet);
  return sheet;
}

// Jira field paths whose resolved value is an image URL, not text —
// rendered via =IMAGE() in writeJiraIssuesToSheet() instead of a plain
// URL string. "issuetype.iconUrl" is the standard Jira field for the
// small issue-type icon (bug/task/story/...); add more paths here if a
// future column mapping needs the same treatment.
var JIRA_IMAGE_FIELD_PATHS = ['issuetype.iconUrl'];

// Google Sheets' own default single-line row height — used to keep every
// Jira row a fixed, compact height regardless of how long any cell's text
// is (see the CLIP wrap strategy in writeJiraIssuesToSheet()).
var JIRA_ROW_HEIGHT_PIXELS = 21;

// Rewrites the "Jira" tab from scratch every fetch — a live snapshot of
// "what does the filter return right now", not a history log (same
// full-rebuild idiom as ensureDashboard()). Every row's "Select" checkbox
// starts unchecked — checking rows and then re-fetching before copying
// them to Config loses that selection, a direct consequence of this
// full-rebuild approach (documented, not a bug).
function writeJiraIssuesToSheet(issues, columnMapping, truncated, siteUrl) {
  var sheet = ensureJiraSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();

  var rows = issues.map(function (issue) {
    // A string starting with "=" set via setValues() is interpreted as a
    // real formula by Sheets, exactly like typing it into a cell — no
    // separate setFormula() pass needed. Jira keys never contain quotes,
    // so no escaping is needed here.
    var keyCell = siteUrl
      ? '=HYPERLINK("' + siteUrl + '/browse/' + issue.key + '", "' + issue.key + '")'
      : issue.key;
    var row = [false, keyCell];
    columnMapping.forEach(function (m) {
      row.push(resolveJiraFieldPath(issue, m.path));
    });
    return row;
  });
  if (rows.length) {
    var dataRange = sheet.getRange(2, 1, rows.length, rows[0].length);
    dataRange.setValues(rows);
    // Long text (Titel, a Releasenotes-style column, ...) would otherwise
    // wrap and blow up the row height to fit — CLIP keeps every row a
    // fixed, uniform height instead, truncating overflow at the cell's
    // own boundary (never bleeding into the next column). Applied to the
    // exact row count just written, not a fixed range, so it stays
    // correct however many rows "Max Jira items" ends up producing.
    dataRange.setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
    sheet.setRowHeights(2, rows.length, JIRA_ROW_HEIGHT_PIXELS);

    // applyCheckboxValidation(), not insertCheckboxes() — same reason as
    // everywhere else in this file: insertCheckboxes() would be fine here
    // too (every value just written is a fresh `false`), but staying
    // consistent with the one safe helper avoids ever reintroducing the
    // value-overwrite regression this codebase already got bitten by.
    applyCheckboxValidation(sheet.getRange(2, 1, rows.length, 1));

    // Image-field columns (e.g. issuetype.iconUrl) get overwritten with an
    // =IMAGE() formula instead of the plain URL text set above.
    columnMapping.forEach(function (m, colIndex) {
      if (JIRA_IMAGE_FIELD_PATHS.indexOf(m.path) === -1) return;
      var sheetCol = colIndex + 3; // Select=1, Key=2, columnMapping starts at 3
      for (var r = 0; r < rows.length; r++) {
        var url = rows[r][colIndex + 2];
        if (url) sheet.getRange(2 + r, sheetCol).setFormula('=IMAGE("' + url + '")');
      }
    });
  }

  // Truncation is never silent — visible in the sheet itself, not just in
  // the one-time Ui.alert. No exact total available anymore since Jira's
  // newer search/jql API (only "isLast", no "total") — see
  // CLAUDE_CODE_CONTEXT.md.
  if (truncated) {
    sheet.getRange(2 + rows.length, 1).setValue(
      'Showing: ' + issues.length + ' — there are more results, raise "Max Jira items" in Instellingen for more.'
    );
  }
  applyBrandFont(sheet);
}

// Walks a dotted path (e.g. "assignee.displayName") through a Jira
// issue's fields object. Missing/null at any step -> '' (never throws) —
// a typo'd or unavailable field must never crash the whole fetch. Falls
// back to a best-effort stringify if the path resolves to an object
// rather than a leaf value (e.g. someone configures "assignee" without a
// sub-field).
function resolveJiraFieldPath(issue, path) {
  var segments = path.split('.');
  var value = issue.fields;
  for (var i = 0; i < segments.length; i++) {
    if (value === null || value === undefined) return '';
    value = value[segments[i]];
  }
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    var plainText = extractPlainTextFromAdf(value);
    if (plainText !== null) return plainText;
    return JSON.stringify(value);
  }
  return value;
}

// Jira Cloud stores "rich text" fields (the built-in "description" field,
// and many custom Paragraph-type fields, e.g. Release Notes) as
// Atlassian Document Format (ADF) — a nested JSON structure, not plain
// text. Live-confirmed: a Paragraph custom field's value looks like
// {type:"doc", version:1, content:[{type:"paragraph", content:[{type:
// "text", text:"..."}]}]}. Recursively collects every "text" leaf and
// joins paragraphs with newlines, so a column mapped to such a field
// shows readable text instead of raw ADF JSON. Returns null (not '') for
// anything that isn't ADF-shaped, so the caller falls back to its own
// generic object handling (JSON.stringify) instead.
function extractPlainTextFromAdf(value) {
  if (!value || typeof value !== 'object' || value.type !== 'doc' || !Array.isArray(value.content)) {
    return null;
  }
  function collectText(node) {
    if (!node || typeof node !== 'object') return '';
    if (node.type === 'text') return node.text || '';
    // ADF's manual line break (Shift+Enter within one paragraph) is a
    // leaf node with no .text and no .content — without this, words on
    // either side of it would run together with no separator at all.
    if (node.type === 'hardBreak') return ' ';
    if (!Array.isArray(node.content)) return '';
    return node.content.map(collectText).join('');
  }
  // Joined with " | ", NOT "\n": a literal newline in a cell value makes
  // Sheets grow the row to fit every line vertically, REGARDLESS of
  // WrapStrategy.CLIP — CLIP only stops a too-long single line from
  // wrapping, it does not collapse embedded newlines. Live-confirmed:
  // rows kept ballooning even with CLIP + a fixed row height, for
  // Release Notes values spanning multiple ADF paragraphs.
  return value.content.map(collectText).join(' | ').trim();
}

// Which configured top-level field keys never appeared in ANY returned
// issue's fields object — a signal for a likely typo in "Jira kolommen",
// surfaced in runJiraFetch()'s summary alert rather than failing
// silently. Skipped when there are zero issues at all, since that case is
// ambiguous (no field could ever "appear" against 0 results).
function checkForUnknownJiraFields(issues, columnMapping) {
  if (!issues.length) return [];
  var seenKeys = {};
  issues.forEach(function (issue) {
    Object.keys(issue.fields || {}).forEach(function (key) { seenKeys[key] = true; });
  });
  return columnMapping
    .filter(function (m) { return !seenKeys[m.path.split('.')[0]]; })
    .map(function (m) { return m.column; });
}

