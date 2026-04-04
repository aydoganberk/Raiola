const { buildLifecyclePayload, renderReleaseNotes } = require('./lifecycle_common');

buildLifecyclePayload('release_notes', renderReleaseNotes, 'release-notes.md');
