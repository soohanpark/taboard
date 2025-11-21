# Taboard Privacy Policy

**Last Updated: 2025-11-21**

Taboard is a Chrome extension that replaces the new tab page with a tab drawer and personal kanban-style boards. It is designed to run primarily on your device, with optional backup to your own Google Drive.

## Data Collection and Use

- **Local data only by default:** Spaces, boards, cards, preferences, and UI settings are stored in your browser via `chrome.storage.local`. This data stays on your device unless you choose to sync it to Google Drive.
- **Optional Google Drive sync:** If you connect Google Drive, Taboard will use Chrome’s Identity API to obtain an OAuth token and will create/read/write a `TaboardSync.json` file in your Drive. Board data is sent directly between your browser and Google’s APIs; it is not sent to servers operated by the Taboard developer. Disconnecting Drive stops sync and clears stored Drive metadata locally.
- **Tab access:** Taboard reads active tab metadata (title, URL, favicon) to display the tab drawer and to let you save tabs as cards. This information is processed locally for the requested features and is not transmitted to the developer.

## No External Analytics or Tracking

Taboard does not use analytics, tracking pixels, or other third-party data collection services.

## Changes to This Policy

We may update this Privacy Policy from time to time. When we do, we will revise the “Last Updated” date above. Please review this page periodically for any changes.

## Contact

If you have questions about this Privacy Policy, please open an issue at [https://github.com/soohanpark/taboard](https://github.com/soohanpark/taboard).
