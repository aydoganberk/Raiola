const { buildLifecyclePayload, renderSessionReport } = require('./lifecycle_common');

buildLifecyclePayload('session_report', renderSessionReport, 'session-report.md');
