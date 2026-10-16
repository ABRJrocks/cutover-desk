# Security and trust boundaries

Report suspected vulnerabilities privately to abdul.rafay@deventities.com with a minimal reproduction and version. Do not include live secrets or customer data. No response-time guarantee or independent security audit is claimed.

Cutover Desk is a human rehearsal tool, not a command runner or approval system. Notes, coordinator names and outcomes are user-reported. Exported files and browser storage can be edited. Event replay checks structural consistency but provides no authenticity, signatures or tamper evidence.

Browser local storage and exported documents contain plaintext. Never enter credentials or personal customer data. Exporting intentionally creates a file that may be shared; review it before placing it in an issue or repository. The app itself sends no document-upload or analytics requests. Static hosting still handles ordinary page requests.

Storage isolation is per origin, not per URL path. All GitHub Pages projects under `abrjrocks.github.io` share an origin. Host your own copy on a dedicated trusted origin or localhost when that boundary matters. XSS or another untrusted same-origin application can access local storage. Dependency updates must be reviewed and tested.

The application bounds documents, validates dependencies and replays imported histories. Text renders through React text nodes; it is never interpreted as HTML, Markdown or code in the application. Markdown exports escape formatting-sensitive characters, but recipients should still treat all evidence text as untrusted user content. The app does not fetch arbitrary URLs from imported documents.

Cross-tab detection is advisory protection against stale writes, not a transactional lock. Use one active coordinator tab and regular JSON exports. Corrupt data is preserved for recovery rather than silently replaced. There is no backup service, retention service, team synchronization or authenticated access control.
