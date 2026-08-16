// ============================================================
// JIRA IMPORT — PERMISSIONS / OAUTH — per-user OAuth 2.0 (3LO) via the
//    "OAuth2 for Apps Script" library (added once, manually, via Libraries
//    in the Apps Script editor — script ID
//    1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF, identifier
//    "OAuth2" — see Instructies.md; a project-level library reference
//    can't be expressed inside a project file itself, same class of manual
//    one-time step as WEBAPP_URL).
//    Every user authorizes with THEIR OWN Atlassian identity — never a
//    shared/admin account, never the developer's own. The property store
//    is PropertiesService.getUserProperties(), confirmed genuinely
//    isolated per Google account executing the script (unlike Script
//    Properties, which are shared project-wide). The OAuth callback runs
//    through Apps Script's own built-in .../usercallback URL (tied to
//    this script's project ID), NOT through doGet()/WEBAPP_URL — so this
//    never collides with the Checklist webapp routing.
// ============================================================

var JIRA_OAUTH_SCOPE = 'read:jira-work offline_access';

function getJiraOAuthService() {
  var settings = getSettings();
  return OAuth2.createService('Jira')
    .setAuthorizationBaseUrl('https://auth.atlassian.com/authorize')
    .setTokenUrl('https://auth.atlassian.com/oauth/token')
    .setClientId(settings.jiraOAuthClientId)
    .setClientSecret(settings.jiraOAuthClientSecret)
    .setCallbackFunction('jiraOAuthCallback')
    .setPropertyStore(PropertiesService.getUserProperties())
    .setScope(JIRA_OAUTH_SCOPE)
    // Per Atlassian's 3LO docs consulted while designing this — NOT yet
    // independently confirmed live (see CLAUDE_CODE_CONTEXT.md TODO).
    // Without "audience", Atlassian's authorize endpoint doesn't know
    // which API to issue the token for; "prompt=consent" aims to make
    // re-authorization reliably reissue a refresh token.
    .setParam('audience', 'api.atlassian.com')
    .setParam('prompt', 'consent');
}

// Registered as the OAuth2 service's callback function — invoked by Apps
// Script's own built-in https://script.google.com/macros/d/{SCRIPT_ID}/usercallback
// URL, never through doGet(). Must stay a bare top-level function; the
// OAuth2 library looks it up by name.
function jiraOAuthCallback(request) {
  var service = getJiraOAuthService();
  var authorized = service.handleCallback(request);
  return HtmlService.createHtmlOutput(
    authorized
      ? 'Jira-autorisatie gelukt — je mag dit tabblad sluiten en teruggaan naar de Sheet.'
      : 'Jira-autorisatie mislukt of geweigerd — je mag dit tabblad sluiten en het opnieuw proberen vanuit de Sheet.'
  );
}

// Menu entry point ("🔷Fetch from Jira"). Not yet authorized (or a
// revoked/expired grant) -> shows the authorization link instead of
// fetching; already authorized -> fetches directly. hasAccess() is
// wrapped defensively — whether it throws or just returns false on an
// expired/revoked refresh token isn't confirmed live yet (see
// CLAUDE_CODE_CONTEXT.md TODO), so both outcomes are treated the same:
// show the authorization dialog again.
function fetchFromJira() {
  var settings = getSettings();
  if (!settings.jiraOAuthClientId || !settings.jiraOAuthClientSecret) {
    SpreadsheetApp.getUi().alert(
      'JIRA_OAUTH_CLIENT_ID / JIRA_OAUTH_CLIENT_SECRET are not set yet as ' +
      'Script properties. See Instructies.md for the one-time setup ' +
      '(registering the OAuth app in the Atlassian Developer Console).'
    );
    return;
  }

  var service = getJiraOAuthService();
  var hasAccess = false;
  try {
    hasAccess = service.hasAccess();
  } catch (err) {
    Logger.log('fetchFromJira: hasAccess() threw an error, treated as not authorized: ' + err);
  }

  if (!hasAccess) {
    showJiraAuthorizationDialog(service);
    return;
  }

  try {
    runJiraFetch(service);
  } catch (err) {
    SpreadsheetApp.getUi().alert('Fetch from Jira failed: ' + err);
  }
}

// HtmlService modal, not Ui.alert — a deliberate, one-off exception (see
// CLAUDE_CODE_CONTEXT.md): Ui.alert is text-only and can't render a
// clickable link, and a raw OAuth URL (client ID, scope, redirect URI,
// audience, ...) is long and error-prone to hand-copy.
function showJiraAuthorizationDialog(service) {
  var authorizationUrl = service.getAuthorizationUrl();
  var html = HtmlService.createHtmlOutput(
    '<p>Click the link below, sign in with your OWN Atlassian account, ' +
    'then click "🔷Fetch from Jira" again in the Sheet.</p>' +
    '<p><a href="' + authorizationUrl + '" target="_blank">Authorize access to Jira</a></p>'
  ).setWidth(400).setHeight(150);
  SpreadsheetApp.getUi().showModalDialog(html, 'Jira authorization needed');
}

// Looks up (and caches per-user in UserProperties) which Jira Cloud
// site this user's OAuth grant covers. Picks the first if there's more
// than one — a reasonable default for the expected handful of Acme
// users, each expected to have one Jira site (see CLAUDE_CODE_CONTEXT.md
// TODO if this ever needs to be configurable).
function getJiraSiteInfo(service) {
  var userProps = PropertiesService.getUserProperties();
  var cloudId = userProps.getProperty('JIRA_CLOUD_ID');
  var siteUrl = userProps.getProperty('JIRA_SITE_URL');
  if (cloudId) return { cloudId: cloudId, siteUrl: siteUrl };

  var response = UrlFetchApp.fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: { Authorization: 'Bearer ' + service.getAccessToken() },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) {
    throw new Error('Could not look up Jira sites (status ' + response.getResponseCode() + '): ' + response.getContentText());
  }
  var sites = JSON.parse(response.getContentText());
  if (!sites.length) {
    throw new Error('Your Atlassian account has no access to any Jira site within this authorization.');
  }

  cloudId = sites[0].id;
  siteUrl = sites[0].url;
  userProps.setProperty('JIRA_CLOUD_ID', cloudId);
  userProps.setProperty('JIRA_SITE_URL', siteUrl);
  return { cloudId: cloudId, siteUrl: siteUrl };
}
