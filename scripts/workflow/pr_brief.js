const { buildLifecyclePayload, renderPrBrief } = require('./lifecycle_common');

buildLifecyclePayload('pr_brief', renderPrBrief, 'pr-brief.md');
