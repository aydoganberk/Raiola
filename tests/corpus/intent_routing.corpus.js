function buildGrid(expectedCapability, language, family, openers, subjects, suffixes) {
  const entries = [];
  let index = 1;
  for (const opener of openers) {
    for (const subject of subjects) {
      for (const suffix of suffixes) {
        entries.push({
          id: `${expectedCapability.replace(/[.]/g, '-')}-${index}`,
          goal: `${opener} ${subject} ${suffix}`.replace(/\s+/g, ' ').trim(),
          expectedCapability,
          family,
          language,
        });
        index += 1;
      }
    }
  }
  return entries;
}

function buildIntentRoutingCorpus() {
  return [
    ...buildGrid(
      'research.discuss',
      'mixed',
      'research',
      ['investigate', 'analyze', 'incele'],
      ['why routing confidence is low', 'why the workflow state drifted', 'neden verify plan zayif'],
      ['before patching', 'and explain the safest lane'],
    ),
    ...buildGrid(
      'plan.execution_packet',
      'en',
      'plan',
      ['plan', 'prepare', 'draft'],
      ['the next milestone packet', 'a roadmap slice for the repo', 'the execution packet for this task'],
      ['with risks and verification', 'for the next session'],
    ),
    ...buildGrid(
      'execute.quick_patch',
      'mixed',
      'execute',
      ['fix', 'implement', 'patch'],
      ['the package graph bug', 'the flaky workflow script', 'bu regression issue'],
      ['with a focused change', 'today without broad refactors'],
    ),
    ...buildGrid(
      'review.deep_review',
      'en',
      'review',
      ['review', 'audit', 'inspect'],
      ['the diff for regressions', 'the patch for blockers', 'the PR for risk heatmap output'],
      ['before ship', 'and write findings'],
    ),
    ...buildGrid(
      'review.re_review',
      'en',
      'review',
      ['re-review', 'rerun review', 'follow-up review'],
      ['the latest fixes', 'the updated patch', 'the resolved issues'],
      ['against previous findings', 'for unresolved comments'],
    ),
    ...buildGrid(
      'frontend.ui_spec',
      'mixed',
      'frontend',
      ['generate', 'write', 'hazirla'],
      ['the ui spec', 'the design contract', 'the ui plan for the new screen'],
      ['before implementation', 'for the responsive flow'],
    ),
    ...buildGrid(
      'frontend.ui_review',
      'mixed',
      'frontend',
      ['run', 'do', 'capture'],
      ['a ui review', 'a responsive audit', 'a visual audit on the frontend'],
      ['with screenshot evidence', 'on the preview build'],
    ),
    ...buildGrid(
      'verify.shell',
      'en',
      'verify',
      ['verify', 'run', 'check'],
      ['the test suite', 'the shell verification', 'the lint and typecheck flow'],
      ['before closeout', 'and keep the output'],
    ),
    ...buildGrid(
      'verify.browser',
      'mixed',
      'verify',
      ['smoke', 'preview', 'capture'],
      ['the preview URL', 'browser screenshots', 'the frontend flow in browser'],
      ['and assert the main screen', 'for screenshot evidence'],
    ),
    ...buildGrid(
      'team.parallel',
      'mixed',
      'ops',
      ['parallelize', 'delegate', 'team'],
      ['a read-only sweep', 'work across packages', 'bu taski subagentler ile'],
      ['without overlapping scopes', 'with subagents'],
    ),
    ...buildGrid(
      'ship.release',
      'mixed',
      'ship',
      ['ship', 'release', 'yayinla'],
      ['the current slice', 'the closeout package', 'the release candidate'],
      ['with handoff notes', 'after final review'],
    ),
    ...buildGrid(
      'incident.triage',
      'mixed',
      'incident',
      ['triage', 'handle', 'hotfix'],
      ['the prod regression', 'the urgent outage', 'bu incident issue'],
      ['with the safest verify path', 'before more users are affected'],
    ),
    {
      id: 'review-deep-tr-1',
      goal: 'kapsamli urun degerlendirmesi yap',
      expectedCapability: 'review.deep_review',
      family: 'review',
      language: 'tr',
    },
    {
      id: 'review-deep-tr-2',
      goal: 'bu repo icin kapsamli urun degerlendirmesi yap ve riskleri yaz',
      expectedCapability: 'review.deep_review',
      family: 'review',
      language: 'tr',
    },
    {
      id: 'research-discuss-tr-1',
      goal: 'kapsamli analiz yap ve en buyuk riski acikla',
      expectedCapability: 'research.discuss',
      family: 'research',
      language: 'tr',
    },
    {
      id: 'review-deep-tr-3',
      goal: 'inceleme yap ve bulgulari yaz',
      expectedCapability: 'review.deep_review',
      family: 'review',
      language: 'tr',
    },
    {
      id: 'research-discuss-en-1',
      goal: 'look into why the verification plan feels weak before patching',
      expectedCapability: 'research.discuss',
      family: 'research',
      language: 'en',
    },
    {
      id: 'research-discuss-tr-2',
      goal: 'neden verify plani zayif bir bak ve kok nedeni acikla',
      expectedCapability: 'research.discuss',
      family: 'research',
      language: 'tr',
    },
    {
      id: 'plan-execution-en-1',
      goal: 'put together the next execution packet with risks and checks',
      expectedCapability: 'plan.execution_packet',
      family: 'plan',
      language: 'en',
    },
    {
      id: 'plan-execution-tr-1',
      goal: 'bir sonraki milestone paketini hazirla ve verify planini ekle',
      expectedCapability: 'plan.execution_packet',
      family: 'plan',
      language: 'tr',
    },
    {
      id: 'review-deep-en-1',
      goal: 'go over the diff and call out blockers',
      expectedCapability: 'review.deep_review',
      family: 'review',
      language: 'en',
    },
    {
      id: 'review-deep-tr-4',
      goal: 'elden gecir ve riskleri yaz',
      expectedCapability: 'review.deep_review',
      family: 'review',
      language: 'tr',
    },
    {
      id: 'verify-browser-en-1',
      goal: 'smoke test the preview and capture screenshots',
      expectedCapability: 'verify.browser',
      family: 'verify',
      language: 'en',
    },
    {
      id: 'verify-browser-tr-1',
      goal: 'previewu smoke et ve ekran goruntusu al',
      expectedCapability: 'verify.browser',
      family: 'verify',
      language: 'tr',
    },
    {
      id: 'team-parallel-en-1',
      goal: 'split this up and delegate across packages',
      expectedCapability: 'team.parallel',
      family: 'ops',
      language: 'en',
    },
    {
      id: 'team-parallel-tr-1',
      goal: 'bunu parcalara bol ve paketlere dagit',
      expectedCapability: 'team.parallel',
      family: 'ops',
      language: 'tr',
    },
    {
      id: 'ship-release-en-1',
      goal: 'get this out with handoff notes after final review',
      expectedCapability: 'ship.release',
      family: 'ship',
      language: 'en',
    },
    {
      id: 'ship-release-tr-1',
      goal: 'bunu yayina al ve handoff notlarini ekle',
      expectedCapability: 'ship.release',
      family: 'ship',
      language: 'tr',
    },
  ];
}

module.exports = {
  buildIntentRoutingCorpus,
};
