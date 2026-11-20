# gmail-marketplace

Run a Sprint Review in "marketplace" format — multiple topics, each with its
own desk — entirely in Google Sheets, Forms, Slides and Apps Script.

No external tools, no servers — just Google Apps Script tied together with
Sheets, Forms, Slides and (optionally) Jira.

## 🎯 What it does

- **Topics & desks** are configured in one `Config` tab — no code changes to
  add, remove or rename a topic
- **Visitors self-register** interest via a subscription Form, synced from
  the active topics in `Config`
- **During the Review**, visitors self-check-in per topic via a checklist
  webapp (QR code) — self-service, no host administration or name-matching
- **📍 Office floorplan** — a `Plattegrond` tab links every `Desk` to a
  position on a floorplan image; `🗺️Plattegrond beheren` opens a click-to-place
  editor (import desks, place pins, rename, drag, (de)activate)
- **🖥️ Auto-generated PO presentation** (Slides) with a topics-list slide
  that paginates itself automatically when there are too many topics for one
  page
- **🔷 Optional Jira integration** — pull candidate topics straight from Jira
  into `Config`
- **Reusable by design** — the Sheet, Form and Slides template are permanent
  "mother-artifacts" shared across every Review cycle; `🏛️Archive results`
  archives one cycle's results to a separate archive Spreadsheet and resets
  everything for the next
- **Email fallback built in from day one** — ready for inviting people
  without a Workspace account later, without a code change

## 📁 Architecture

```
gmail-marketplace/
├── Code.gs                                    — entry points / triggers
├── Core.gs                                     — 🛍️Marketplace tools menu (onOpen) + orchestration
├── Sheets.gs                                   — Config / Aanmeldingen / Dashboard sheet logic
├── Subscription.gs                             — subscription Form + onFormSubmitHandler
├── Plattegrond.gs, PlattegrondImage.gs,
│   PlattegrondDialog.html                      — floorplan editor
├── Slides.gs, SlidesBullets.gs, SlidesTable.gs — PO presentation generation
├── Jira.gs, JiraAuth.gs, JiraToConfig.gs       — optional Jira topic import
├── Archive.gs, Cleanup.gs                      — end-of-cycle archive & reset
├── SelfTests.gs                                — self-tests, runnable from CI
├── Checklist.html                              — visitor-facing checklist webapp
├── res/                                        — floorplan image assets
├── appsscript.json                             — Apps Script manifest
└── .clasp.json                                 — link to the Apps Script project
```

## 📋 Requirements

- Google Workspace account with Sheets, Forms, Slides and Apps Script access
- (Optional) Jira access, for the `🔷Fetch from Jira` topic import

## 🚀 Setup

See [Instructies.md](./Instructies.md) for the full one-time setup: preparing
the Sheet, linking the script, building the Slides template, script
properties, permissions, deploying the checklist webapp, the optional Jira
link, and the optional CI setup for auto-deploy + self-tests.

## 🖱️ Usage

Use the **🛍️Marketplace tools** menu in the Sheet:

| Menu item | What it does |
|---|---|
| 📋 Sheet structure setup/rebuild | (Re)creates the Config/Plattegrond/Aanmeldingen tabs |
| 🗺️ Plattegrond beheren | Opens the floorplan editor |
| 🔄 Sync topics Subscription form | Regenerates the subscription Form from active topics |
| 🖥️ Generate Presentation | Builds the PO presentation |
| 🔁 Regenerate Checklist QR | Regenerates the checklist webapp's QR code |
| 🏛️ Archive results | Archives the current cycle's results and resets for the next |
| 🔷 Fetch from Jira | Pulls candidate topics from Jira |
| 📥 Copy selected to Config | Copies checked Jira items into Config |

## 📚 Documentation

| Document | Description |
|---|---|
| [Instructies.md](./Instructies.md) | Full one-time setup guide |
| [CLAUDE_CODE_CONTEXT.md](./CLAUDE_CODE_CONTEXT.md) | Design rationale, architecture decisions and implementation status — read before changing anything |

## 📜 License

This project is licensed under the Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0). This means you can:

- Share: Copy and redistribute the material in any medium or format
- Adapt: Remix, transform, and build upon the material

Under the following terms:
- Attribution: You must give appropriate credit, provide a link to the license, and indicate if changes were made.
- NonCommercial: You may not use the material for commercial purposes.
- No additional restrictions: You may not apply legal terms or technological measures that legally restrict others from doing anything the license permits.

See the [LICENSE](LICENSE) file for details.

---

**Made with ❤️ for efficiency and automation**
