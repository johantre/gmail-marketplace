// ============================================================
// 2. PRESENTATION FOR THE PO — generated from a Slides template with free
//    intro/closing slides (Acme style, left untouched) and one or more
//    topics list slides — any mix of the two modes below is fine (auto-
//    detected by content, see findTopicsListSlides), since visual format
//    is a template/presentation choice and must never constrain what the
//    processing logic allows. Each occurrence found gets filled
//    independently, with its own pagination:
//    - Bullet mode: a text box with at least 1 bullet line that literally
//      contains {{Topic}}. How many topics fit per page is NOT determined
//      by however many lines the template happens to have, but by "Max
//      topics per slide" in Instellingen: missing bullet lines get added
//      automatically (growTopicsCapacity, inherits the bullet style of
//      the previous line) up to that maximum, and excess lines on a page
//      with fewer topics than capacity get fully removed too
//      (trimTrailingParagraphs), not just cleared. See SlidesBullets.gs.
//    - Table mode: a table with a row containing {{Topic}}/{{Desk}}/
//      {{Beschrijving}} in separate cells. Same "Max topics per slide"
//      setting as bullet mode: missing rows get appended automatically
//      (growTableCapacity, copies the pattern row's fill + text style
//      onto each new row — but NOT its border, since the Apps Script
//      Slides service has no way to read/set a table cell's border at
//      all; a confirmed gap, accepted as a manual touch-up). No setting?
//      Falls back to however many rows marketing already built. See
//      SlidesTable.gs.
//    Either way, too many topics for one page duplicates the topics slide
//    as many extra times as needed, with the topics spread as evenly as
//    possible across the pages (distributeTopicsEvenly).
//    Every row in the Instellingen tab automatically becomes a usable
//    {{<Sleutel>}} placeholder, anywhere in the template (see
//    applyInstellingenPlaceholders) — need a new variable? Just add a row
//    in Instellingen, no code needed. {{ChecklistQR}} is a special,
//    hardcoded placeholders (like {{Topic}}, not Instellingen rows): any
//    shape containing one gets replaced by an actual QR code image at the
//    same position/size (insertQrCodePlaceholders) — {{ChecklistQR}} for
//    the checklist webapp (handy on a closing slide so visitors can scan
//    it during the session), {{SubscriptionQR}} for the sign-up form.
// ============================================================

// Replaces every shape containing {{ChecklistQR}} or {{SubscriptionQR}}
// (either token may appear on multiple slides/times, no "exactly 1"
// requirement like the topics list) with an actual QR code image at the
// same position/size. Each token is independently optional — silently
// skipped if its URL isn't available yet (WEBAPP_URL unset, or no
// subscription form generated yet), since these are optional extras that
// must never block the rest of generateSlides().
function insertQrCodePlaceholders(deck) {
  insertQrCodeForToken(deck, '{{ChecklistQR}}', getSettings().webappUrl);
  insertQrCodeForToken(deck, '{{SubscriptionQR}}', getLastLoggedLink('Inschrijfformulier'));
}

function insertQrCodeForToken(deck, token, url) {
  if (!url) return;
  var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=' + encodeURIComponent(url);

  deck.getSlides().forEach(function (slide) {
    slide.getShapes().forEach(function (shape) {
      var text;
      try {
        text = shape.getText().asString();
      } catch (err) {
        return; // not every shape (e.g. images) supports text
      }
      if (text.indexOf(token) === -1) return;

      var left = shape.getLeft();
      var top = shape.getTop();
      var width = shape.getWidth();
      var height = shape.getHeight();
      // Insert BEFORE removing the placeholder, and wrapped: qrserver.com
      // fetch failures happen (confirmed live: "could not be retrieved" —
      // a transient external issue, not a code bug) and this is an
      // optional extra that must never crash the rest of generateSlides().
      // Removing the placeholder only on success means a failed fetch
      // just leaves the original {{...QR}} text visible (recoverable by
      // re-running), instead of silently deleting it with nothing to
      // replace it.
      try {
        slide.insertImage(qrUrl, left, top, width, height);
        shape.remove();
      } catch (err) {
        Logger.log('insertQrCodeForToken: could not insert QR image for ' + token + ' (possibly a transient qrserver.com issue), placeholder text stays in place: ' + err);
      }
    });
  });
}
function generateSlides() {
  var topics = getActiveTopics();
  if (!topics.length) {
    SpreadsheetApp.getUi().alert('No active topics in Config. Check at least one row under "Actief" before generating a presentation.');
    return;
  }

  var settings = getSettings();
  if (!settings.slidesTemplateId) {
    SpreadsheetApp.getUi().alert('Set SLIDES_TEMPLATE_ID in Script properties first (see the top of Code.gs / getSettings() in Core.gs).');
    return;
  }

  var ui = SpreadsheetApp.getUi();
  var timestamp = Utilities.formatDate(new Date(), 'Europe/Brussels', 'yyyy-MM-dd HHmm');
  var reviewTitel = getInstellingWaarde('Review titel');
  var fileName = 'Marketplace presentatie' + (reviewTitel ? ' — ' + reviewTitel : '') + ' — ' + timestamp;
  var templateFile = DriveApp.getFileById(settings.slidesTemplateId);
  var copy = makeCopyInDriveFolder(templateFile, fileName, settings.driveFolderId);

  var deck = SlidesApp.openById(copy.getId());
  applyInstellingenPlaceholders(deck);
  insertQrCodePlaceholders(deck);

  // Visual format (bullet list vs. table) is purely a template/presentation
  // choice — it must never constrain how many topics-list occurrences a
  // template may contain. So EVERY match found gets filled independently,
  // in whatever format it happens to use; a template may freely mix any
  // number of bullet- and table-based topics lists (e.g. one of each, for
  // trying out both formats, or because different slides genuinely want
  // different layouts). Only finding ZERO is an error — there must be
  // somewhere to show the topics list at all.
  var matches = findTopicsListSlides(deck);
  if (!matches.length) {
    copy.setTrashed(true); // tidied-up, half-finished copy — recoverable via the Drive trash
    ui.alert(
      'Could not find a topics list slide in the Slides template. Make ' +
      'sure at least 1 text box OR table cell somewhere in the template ' +
      'has literally {{Topic}} in it (see Instructies.md step 3) and try again.'
    );
    return;
  }

  var maxPerSlideSetting = parseInt(getInstellingWaarde(MAX_TOPICS_PER_SLIDE_KEY), 10);
  var hasMaxSetting = !isNaN(maxPerSlideSetting) && maxPerSlideSetting > 0;

  matches.forEach(function (match) {
    var topicsSlide = match.slide;
    var capacity;

    if (match.type === 'bullet') {
      var templateCapacity = match.shape.getText().getParagraphs().length - match.patternParagraphIndex;
      // "Max topics per slide" (Instellingen) determines how many topics fit
      // per page — the template itself only needs to show 1 bullet line (for
      // the style); missing lines get added below (growTopicsCapacity), no
      // longer bounded by whatever happens to physically be in the template
      // already. No setting? Then it falls back to what's already there
      // (templateCapacity), same as before.
      capacity = hasMaxSetting ? maxPerSlideSetting : templateCapacity;
      growTopicsCapacity(match.shape, match.patternParagraphIndex, capacity);
    } else {
      // Table mode: same "Max topics per slide" setting as bullet mode
      // (growTableCapacity appends rows, copying the pattern row's fill +
      // text style onto each new row). No setting? Falls back to however
      // many rows marketing already built. Deliberately does NOT copy
      // borders — see growTableCapacity()'s comment for why (a confirmed
      // Apps Script limitation, not a guess).
      var templateTableCapacity = match.table.getNumRows() - match.patternRowIndex;
      capacity = hasMaxSetting ? maxPerSlideSetting : templateTableCapacity;
      growTableCapacity(match.table, match.patternRowIndex, capacity, match.columnMap);
    }

    var chunks = distributeTopicsEvenly(topics, capacity);

    // First duplicate ALL extra pages while topicsSlide is still unchanged,
    // only fill them in after — same reason as the earlier per-topic fix:
    // duplicating AFTER filling would copy the already-filled version every time.
    var extraSlides = [];
    for (var p = 1; p < chunks.length; p++) {
      extraSlides.push(topicsSlide.duplicate());
    }
    // Looked up fresh via object ID (getSlidePosition), so this is
    // unaffected by any slides an earlier match in this same forEach may
    // already have inserted elsewhere in the deck.
    var baseIndex = getSlidePosition(deck, topicsSlide);
    extraSlides.forEach(function (slide, i) {
      slide.move(baseIndex + 1 + i); // right after the topics slide, in order, before the closing slides
    });

    var pageSlides = [topicsSlide].concat(extraSlides);
    pageSlides.forEach(function (slide, i) {
      if (match.type === 'bullet') {
        fillBulletTopicsListSlide(slide, match.patternParagraphIndex, match.patternText, chunks[i]);
      } else {
        fillTableTopicsListSlide(slide, match.patternRowIndex, match.columnMap, chunks[i]);
      }
    });
  });

  deck.saveAndClose();
  logLink('Presentatie', copy.getUrl());
  ui.alert('Presentation ready.\n\nLink: ' + copy.getUrl());
}

// Searches, across all slides of the template, for every spot where a text
// box contains a bullet line with literally {{Topic}} (bullet mode), OR a
// table has a row with a cell containing {{Topic}} (table mode).
function findTopicsListSlides(deck) {
  var matches = [];
  deck.getSlides().forEach(function (slide) {
    var bulletFound = findBulletPattern(slide);
    if (bulletFound) {
      matches.push({
        type: 'bullet', slide: slide, shape: bulletFound.shape,
        patternParagraphIndex: bulletFound.patternParagraphIndex, patternText: bulletFound.patternText
      });
    }
    var tableFound = findTablePattern(slide);
    if (tableFound) {
      matches.push({
        type: 'table', slide: slide, table: tableFound.table,
        patternRowIndex: tableFound.patternRowIndex, columnMap: tableFound.columnMap
      });
    }
  });
  return matches;
}

// Distributes topics over the MINIMUM number of pages of at most
// maxPerSlide each, spread as evenly as possible — instead of always
// filling the first pages completely and dumping the rest on the last
// page (which left an almost-empty last slide). E.g. 31 topics with max 10
// -> 4 pages of 8/8/8/7, not 10/10/10/1.
function distributeTopicsEvenly(topics, maxPerSlide) {
  var slideCount = Math.ceil(topics.length / maxPerSlide);
  var base = Math.floor(topics.length / slideCount);
  var remainder = topics.length % slideCount;

  var chunks = [];
  var index = 0;
  for (var s = 0; s < slideCount; s++) {
    var size = base + (s < remainder ? 1 : 0);
    chunks.push(topics.slice(index, index + size));
    index += size;
  }
  return chunks;
}

// The Slide class has no method of its own to report its position — look
// it up via the object ID in the presentation's full slide list.
function getSlidePosition(deck, targetSlide) {
  var targetId = targetSlide.getObjectId();
  var slides = deck.getSlides();
  for (var i = 0; i < slides.length; i++) {
    if (slides[i].getObjectId() === targetId) return i;
  }
  return -1;
}
