// ============================================================
// MARKETPLACE TOOLS — project overview
// Everything starts from the "Config" tab (Topic | Desk | Beschrijving | Actief).
// Change topics/desks by typing a row there. Never change anything here
// for a new topic.
//
// This file is deliberately just an index — every function now lives in
// one of the files below, split by responsibility:
//   Core.gs           - shared helpers: settings (getSettings), the menu
//                        (onOpen), Config reading, Drive helpers, brand/
//                        checkbox styling, the Links tab (logLink/
//                        getLastLoggedLink)
//   Sheets.gs         - Config/Instellingen/QR-codes/Aanmeldingen/
//                        Dashboard structure setup
//   Subscription.gs   - subscription form generation/submission + the
//                        Checklist webapp (doGet/getMyChecklist/setBezocht)
//   Slides.gs         - presentation generation (orchestration)
//   SlidesBullets.gs  - bullet-mode topics-list slide logic
//   SlidesTable.gs    - table-mode topics-list slide logic
//   Archive.gs        - archiving a cycle to the archive spreadsheet
//   Cleanup.gs        - resetting Aanmeldingen/Form for the next cycle
//   JiraAuth.gs       - per-user OAuth 2.0 (3LO) Atlassian authorization
//   Jira.gs           - Jira JQL/field-mapping/Sheet-writing
//   JiraToConfig.gs   - copying a fetched Jira row into Config
//   SelfTests.gs      - runSelfTests()/runSelfTestsCore()
// ============================================================

// ---------- One-time settings ----------
// Set these in: Extensies > Apps Script > Projectinstellingen (gear icon) > Script properties.
//   SLIDES_TEMPLATE_ID  -> ID of your Slides template (marketing can restyle it freely)
//   DRIVE_FOLDER_ID     -> (optional) folder where generated presentations end up
//   FORM_ID             -> filled in automatically after the first "🔄 Sync topics Subscription form"
//   WEBAPP_URL          -> paste the /exec URL here yourself right after deploying the web app
//                          (Deploy > Manage deployments). Deliberately NOT read via
//                          ScriptApp.getService().getUrl() — Google confirms that call returns a
//                          URL with the WRONG deployment ID when invoked outside an active web
//                          request (e.g. from this menu), which is exactly what caused the earlier
//                          "Sorry, unable to open the file at present" error. Known, unfixed Google
//                          limitation — pasting the real URL manually is the documented workaround.
//   JIRA_OAUTH_CLIENT_ID     -> Client ID of the OAuth 2.0 (3LO) app registered in the Atlassian
//   JIRA_OAUTH_CLIENT_SECRET -> Developer Console (https://developer.atlassian.com/console/myapps/),
//                               shared by every user of this Sheet — see Instructies.md for the
//                               one-time setup (incl. the callback URL this app must be registered
//                               with). This is the app registration only; each individual user still
//                               authorizes with their OWN Atlassian identity (see JiraAuth.gs).
//   SELFTEST_TOKEN      -> a secret string of your choosing, gating the CI self-test endpoint
//                          (?selftest=<token> on the web app URL, see handleSelfTestRequest() in
//                          SelfTests.gs). Deliberately kept OUT of getSettings() — read directly via
//                          PropertiesService only where needed, to minimize where the secret is handled.
// getSettings() (Core.gs) reads everything above EXCEPT SELFTEST_TOKEN.
