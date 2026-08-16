// ============================================================
// SLIDES — BULLET MODE — pattern detection and fill/trim logic specific
//    to a topics-list slide built from bullet lines in a text box (as
//    opposed to a table — see SlidesTable.gs). Orchestration shared by
//    both modes (generateSlides(), findTopicsListSlides(),
//    distributeTopicsEvenly(), getSlidePosition()) lives in Slides.gs.
// ============================================================

function findBulletPattern(slide) {
  var shapes = slide.getShapes();
  for (var s = 0; s < shapes.length; s++) {
    var found = findPatternParagraph(shapes[s]);
    if (found) return { shape: shapes[s], patternParagraphIndex: found.index, patternText: found.text };
  }
  return null;
}

// Returns the text of the paragraph without the trailing \n (see
// paragraphTextOnly), together with its index, so we can later reuse that
// exact text (with marketing's own order/separators) as a template instead
// of inventing a fixed format ourselves.
function findPatternParagraph(shape) {
  var textRange;
  try {
    textRange = shape.getText();
  } catch (err) {
    return null; // not every shape (e.g. images) supports text
  }
  var paragraphs = textRange.getParagraphs();
  for (var i = 0; i < paragraphs.length; i++) {
    var text = paragraphTextOnly(paragraphs[i]);
    if (text.indexOf('{{Topic}}') !== -1) return { index: i, text: text };
  }
  return null;
}

// Paragraph.getRange() includes the trailing \n — explicitly exclude that
// for both reading and writing, otherwise setText() merges the paragraph
// with the next one (see fillBulletTopicsListSlide).
function paragraphTextOnly(paragraph) {
  var full = paragraph.getRange();
  return full.getRange(0, full.getLength() - 1).asString();
}

// Replaces only the {{Topic}}/{{Desk}}/{{Beschrijving}} tokens within the
// template's pattern text — so it keeps the exact order and separators
// marketing chose, instead of a fixed format.
function renderTopicLine(pattern, t) {
  return pattern
    .split('{{Topic}}').join(t.topic)
    .split('{{Desk}}').join(t.desk)
    .split('{{Beschrijving}}').join(t.beschrijving);
}

// Adds empty bullet lines until at least desiredSlots are available from
// the pattern paragraph onward. Inserting a new \n right before the text
// box's trailing \n automatically inherits the paragraph style (incl.
// bullet/list formatting) from the preceding line — just like pressing
// Enter in the Slides editor. That way the template only needs to show 1
// line (for the style); the code adds the rest itself up to the
// configured maximum.
function growTopicsCapacity(shape, patternParagraphIndex, desiredSlots) {
  while (true) {
    var textRange = shape.getText();
    var have = textRange.getParagraphs().length - patternParagraphIndex;
    if (have >= desiredSlots) return;
    var fullText = textRange.asString(); // always ends in \n
    textRange.insertText(fullText.length - 1, '\n');
  }
}

// Every duplicate is its own Slide instance — the text box/paragraphs are
// looked up fresh here on THIS slide each time, instead of reusing a
// reference from another slide.
function fillBulletTopicsListSlide(slide, patternParagraphIndex, patternText, chunk) {
  var found = findBulletPattern(slide);
  var paragraphs = found.shape.getText().getParagraphs();
  // Iterate backwards: every setText() can change that paragraph's text
  // length, which shifts the positions of LATER paragraphs. Processing
  // forward therefore let every following line get overwritten with the
  // wrong (ultimately empty) text.
  for (var i = paragraphs.length - 1; i >= patternParagraphIndex; i--) {
    var t = chunk[i - patternParagraphIndex];
    var fullRange = paragraphs[i].getRange();
    // getRange(0, length - 1) explicitly excludes the trailing \n (see
    // paragraphTextOnly) — otherwise setText() merges the paragraph with
    // the next one.
    var textOnlyRange = fullRange.getRange(0, fullRange.getLength() - 1);
    textOnlyRange.setText(t ? renderTopicLine(patternText, t) : '');
  }

  // Fully remove excess bullet lines (more capacity than topics on this
  // page) instead of leaving them empty.
  trimTrailingParagraphs(found.shape, patternParagraphIndex + chunk.length - 1);
}

// Removes all paragraphs AFTER keepThroughIndex, one at a time: the OWN \n
// of the last-wanted paragraph gets removed (not the very last \n of the
// whole text box — that turned out to be a no-op/protected, and caused an
// infinite loop), which merges that paragraph with whatever comes after
// it. Repeat until there's nothing left to remove. Same proven trick as
// filling (getRange(0, length-1) to exclude the paragraph's own \n when
// READING its content) — used here to actually make it disappear.
function trimTrailingParagraphs(shape, keepThroughIndex) {
  for (var guard = 0; guard < 1000; guard++) {
    var textRange = shape.getText();
    var paragraphs = textRange.getParagraphs();
    if (keepThroughIndex >= paragraphs.length - 1) return; // nothing left to remove

    var keepRange = paragraphs[keepThroughIndex].getRange();
    var ownTextWithoutNewline = keepRange.getRange(0, keepRange.getLength() - 1).asString();
    keepRange.setText(ownTextWithoutNewline); // overwrite the FULL range (incl. own \n) without \n -> merges with the next paragraph
  }
  throw new Error('trimTrailingParagraphs: too many iterations, likely stuck in a loop.');
}
