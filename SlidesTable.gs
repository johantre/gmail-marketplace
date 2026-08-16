// ============================================================
// SLIDES — TABLE MODE — pattern detection and fill/trim logic specific
//    to a topics-list slide built from a table (as opposed to bullet
//    lines in a text box — see SlidesBullets.gs). Orchestration shared by
//    both modes (generateSlides(), findTopicsListSlides(),
//    distributeTopicsEvenly(), getSlidePosition()) lives in Slides.gs.
// ============================================================

// Scans every table on the slide for a row containing {{Topic}} in one of
// its cells — that becomes the pattern row. {{Desk}}/{{Beschrijving}} are
// mapped to whichever columns of that same row contain them (order-free,
// same as bullet mode); a missing one just doesn't get filled in.
function findTablePattern(slide) {
  var tables = slide.getTables();
  for (var t = 0; t < tables.length; t++) {
    var table = tables[t];
    for (var r = 0; r < table.getNumRows(); r++) {
      var columnMap = {};
      for (var c = 0; c < table.getNumColumns(); c++) {
        var text = getCellTextOnly(table.getCell(r, c));
        if (text.indexOf('{{Topic}}') !== -1) columnMap.topic = c;
        if (text.indexOf('{{Desk}}') !== -1) columnMap.desk = c;
        if (text.indexOf('{{Beschrijving}}') !== -1) columnMap.beschrijving = c;
      }
      if (columnMap.topic !== undefined) return { table: table, patternRowIndex: r, columnMap: columnMap };
    }
  }
  return null;
}

// Captures a table cell's fill color + text style so it can be re-applied
// to another cell — used by growTableCapacity() to make freshly appended
// rows match the pattern row. Deliberately does NOT include borders: the
// Apps Script Slides service exposes no method anywhere (checked the full
// Table AND TableCell method lists) to read or set a table cell's border
// — a confirmed platform gap, not an oversight. A newly appended row
// therefore keeps Slides' own default border regardless of what the
// pattern row's border looks like; accepted as a manual touch-up rather
// than a blocker, since a presentation is only ever a handful of slides.
function copyCellStyle(cell) {
  var fill = cell.getFill();
  var textStyle = cell.getText().getTextStyle();
  return {
    fillColor: fill.getType() === SlidesApp.FillType.SOLID ? fill.getSolidFill().getColor() : null,
    fontFamily: textStyle.getFontFamily(),
    fontSize: textStyle.getFontSize(),
    bold: textStyle.isBold(),
    italic: textStyle.isItalic(),
    underline: textStyle.isUnderline(),
    foregroundColor: textStyle.getForegroundColor()
  };
}

function applyCellStyle(cell, style) {
  if (isMergedAwayCell(cell)) return; // same guard as getCellTextOnly/setCellText — nothing stylable here
  if (style.fillColor) cell.getFill().setSolidFill(style.fillColor);
  var textStyle = cell.getText().getTextStyle();
  if (style.fontFamily) textStyle.setFontFamily(style.fontFamily);
  if (style.fontSize) textStyle.setFontSize(style.fontSize);
  textStyle.setBold(!!style.bold);
  textStyle.setItalic(!!style.italic);
  textStyle.setUnderline(!!style.underline);
  if (style.foregroundColor) textStyle.setForegroundColor(style.foregroundColor);
}

// Table-mode equivalent of growTopicsCapacity(): appends rows until at
// least desiredSlots are available from the pattern row onward. Unlike
// bullets (where a new paragraph automatically inherits the previous
// line's bullet style), there's no confirmed "new row inherits
// formatting" behavior for tables — so each mapped column's fill/text
// style is captured from the pattern row ONCE and explicitly re-applied
// to every newly appended row.
function growTableCapacity(table, patternRowIndex, desiredSlots, columnMap) {
  var fields = ['topic', 'desk', 'beschrijving'];
  var patternStyles = {};
  fields.forEach(function (field) {
    if (columnMap[field] === undefined) return;
    // Copying fill/text style onto new rows is a cosmetic nice-to-have,
    // never allowed to block the actual topics list from being generated
    // (same principle as moveFileToDriveFolder's best-effort Drive move).
    // Table styling APIs have already surprised us more than once with
    // merge-related edge cases that are impractical to fully enumerate
    // up front — so any failure here is logged and skipped rather than
    // thrown, leaving that field's cells with Slides' own default style
    // (still gets the correct TEXT later via fillTableTopicsListSlide).
    try {
      patternStyles[field] = copyCellStyle(table.getCell(patternRowIndex, columnMap[field]));
    } catch (err) {
      Logger.log('growTableCapacity: could not read the style of the pattern row cell "' + field + '", skipping: ' + err);
    }
  });

  while (table.getNumRows() - patternRowIndex < desiredSlots) {
    table.appendRow();
    // table.getCell(row, col), NOT the just-returned TableRow's own
    // getCell(index) — confirmed live that those two don't necessarily
    // agree on indexing once any merge exists anywhere in the table,
    // which threw the same "has no text" error this file already guards
    // against elsewhere. table.getCell() is the same column-index-based
    // access used consistently everywhere else in this file.
    var newRowIndex = table.getNumRows() - 1;
    fields.forEach(function (field) {
      if (columnMap[field] === undefined || !patternStyles[field]) return;
      try {
        applyCellStyle(table.getCell(newRowIndex, columnMap[field]), patternStyles[field]);
      } catch (err) {
        Logger.log('growTableCapacity: could not apply style to new row ' + newRowIndex + ', column "' + field + '": ' + err);
      }
    });
  }
}

// A cell that's merged into a larger region but isn't that merge's HEAD
// cell throws "The object (...) has no text." the moment you call
// getText() on it (confirmed via the Apps Script Slides reference) — its
// actual content lives on the head cell instead. Every table-mode helper
// that touches cell text goes through this guard, so a template with any
// merged cells (e.g. a merged header row) never crashes the scan.
function isMergedAwayCell(cell) {
  return cell.getMergeState() === SlidesApp.CellMergeState.MERGED;
}

// TableCell.getText() has the same "must end in \n" TextRange behavior as
// Shape.getText() — reuse the same "exclude the trailing \n" trick for
// both reading (pattern detection) and writing (fill) cell text.
function getCellTextOnly(cell) {
  if (isMergedAwayCell(cell)) return ''; // never matches {{Topic}}/etc — its text lives on the head cell, visited separately
  var full = cell.getText();
  return full.getRange(0, full.getLength() - 1).asString();
}

function setCellText(cell, value) {
  if (isMergedAwayCell(cell)) return; // nothing to write to — the head cell already got its value
  var full = cell.getText();
  full.getRange(0, full.getLength() - 1).setText(value);
}

// Table mode: each column shows one field (no combined line like
// renderTopicLine), so cells are set directly. Rows are grown up-front by
// growTableCapacity() (called from generateSlides(), before this runs) —
// this function only ever fills text into rows that already exist. Excess
// rows on the last page (more capacity than topics on that page) are then
// fully removed via trimTrailingTableRows, same end result as bullet
// mode's trimTrailingParagraphs.
function fillTableTopicsListSlide(slide, patternRowIndex, columnMap, chunk) {
  var table = slide.getTables()[0]; // template contract: exactly 1 table on a topics-list slide
  var numRows = table.getNumRows();
  for (var r = patternRowIndex; r < numRows; r++) {
    var t = chunk[r - patternRowIndex];
    if (columnMap.topic !== undefined) setCellText(table.getCell(r, columnMap.topic), t ? t.topic : '');
    if (columnMap.desk !== undefined) setCellText(table.getCell(r, columnMap.desk), t ? t.desk : '');
    if (columnMap.beschrijving !== undefined) setCellText(table.getCell(r, columnMap.beschrijving), t ? t.beschrijving : '');
  }
  trimTrailingTableRows(table, patternRowIndex + chunk.length - 1);
}

// Removes every row AFTER keepThroughIndex, from the bottom up (so
// removing one row never shifts the index of a row not yet removed).
// TableRow.remove() is a plain, documented deletion — no "can't touch the
// very last one" quirk like paragraphs had (trimTrailingParagraphs), so no
// merge-forward trick is needed here. Wrapped defensively: removing rows
// is a tidiness step, never allowed to block the topics list itself if a
// template's table structure (e.g. merged cells spanning rows) makes a
// specific row un-removable.
function trimTrailingTableRows(table, keepThroughIndex) {
  for (var r = table.getNumRows() - 1; r > keepThroughIndex; r--) {
    try {
      table.getRow(r).remove();
    } catch (err) {
      Logger.log('trimTrailingTableRows: could not remove row ' + r + ', it stays blank: ' + err);
      break; // further rows are likely equally stuck (e.g. a row-spanning merge) — stop trying rather than loop
    }
  }
}
