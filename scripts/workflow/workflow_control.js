const TURKISH_ASCII_FOLD = Object.freeze({
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
});

function foldTurkishAscii(value) {
  return String(value || '').replace(/[çğıöşü]/g, (char) => TURKISH_ASCII_FOLD[char] || char);
}

function normalizeWorkflowControlUtterance(value) {
  return foldTurkishAscii(
    String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, ''),
  )
    .replace(/[`"'“”‘’]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const WORKFLOW_CONTROL_CATALOG = Object.freeze([
  {
    id: 'workflow_activation_off',
    family: 'workflow_activation',
    label: 'Disable workflow control plane',
    risk: 'medium',
    action: 'set_workflow_activation',
    state: 'off',
    resolution: 'direct',
    summary: 'Turn workflow handling off for the current task.',
    examples: ['simdilik workflow istemiyorum', 'workflow kullanma', 'workflow kapat'],
    patterns: [
      /\bsimdilik\s+workflow\s+istemiyorum\b/,
      /\bworkflow\s+(?:istemiyorum|kullanma|kapat|off)\b/,
      /\bbu\s+task\s+icin\s+workflow\s+(?:istemiyorum|yok)\b/,
    ],
  },
  {
    id: 'workflow_activation_on',
    family: 'workflow_activation',
    label: 'Enable workflow control plane',
    risk: 'medium',
    action: 'set_workflow_activation',
    state: 'on',
    resolution: 'direct',
    summary: 'Turn workflow handling on for the current task.',
    examples: ['workflow ac', 'workflow kullan', 'workflow ile gidelim'],
    patterns: [
      /\bworkflow\s+(?:ac|aktif(?:\s+et)?|kullan)\b/,
      /\bworkflow\s+ile\s+gidelim\b/,
      /\bworkflow\s+on\b/,
    ],
  },
  {
    id: 'step_plan_condensed',
    family: 'step_control',
    label: 'Condense the plan step',
    risk: 'high',
    action: 'set_step_mode',
    target: 'plan',
    mode: 'condensed',
    resolution: 'safe_fallback',
    summary: 'Plan cannot be skipped literally; resolve it as a condensed plan and keep the gate.',
    examples: ['plan kismini gecelim', 'plani hizli gec', 'skip the plan'],
    patterns: [
      /\bplan(?:\s+(?:kismini|kismi|tarafini|tarafi))?\s+(?:gecelim|gec|atlan(?:alim)?|skip|kisalt(?:alim)?)\b/,
      /\bplani\s+(?:hizli\s+)?gec\b/,
      /\bskip\s+the\s+plan\b/,
      /\bcondensed\s+plan\b/,
    ],
  },
  {
    id: 'step_discuss_condensed',
    family: 'step_control',
    label: 'Condense the discuss step',
    risk: 'medium',
    action: 'set_step_mode',
    target: 'discuss',
    mode: 'condensed',
    resolution: 'direct',
    summary: 'Run the discuss step in condensed mode.',
    examples: ['discuss kismini kisalt', 'konusmayi hizli gec'],
    patterns: [
      /\b(?:discuss|konusma|tartisma)(?:\s+(?:kismini|adimini))?\s+(?:kisalt(?:alim)?|condensed|hizli\s+gec(?:elim)?)\b/,
    ],
  },
  {
    id: 'step_research_condensed',
    family: 'step_control',
    label: 'Condense the research step',
    risk: 'medium',
    action: 'set_step_mode',
    target: 'research',
    mode: 'condensed',
    resolution: 'direct',
    summary: 'Run the research step in condensed mode.',
    examples: ['arastirmayi kisalt', 'research hizli gec'],
    patterns: [
      /\b(?:research|arastirma)(?:\s+(?:kismini|adimini))?\s+(?:kisalt(?:alim)?|condensed|hizli\s+gec(?:elim)?)\b/,
    ],
  },
  {
    id: 'step_audit_smoke',
    family: 'step_control',
    label: 'Switch audit to smoke mode',
    risk: 'medium',
    action: 'set_step_mode',
    target: 'audit',
    mode: 'smoke',
    resolution: 'direct',
    summary: 'Run the audit step as a smoke pass.',
    examples: ['audit smoke olsun', 'denetimi smoke yap'],
    patterns: [
      /\b(?:audit|denetim)(?:\s+(?:kismini|adimini))?\s+(?:smoke|hafif)\b/,
      /\bsmoke\s+(?:audit|denetim)\b/,
    ],
  },
  {
    id: 'step_complete_fast_closeout',
    family: 'step_control',
    label: 'Fast-close the complete step',
    risk: 'medium',
    action: 'set_step_mode',
    target: 'complete',
    mode: 'fast_closeout',
    resolution: 'direct',
    summary: 'Run the complete step in fast-closeout mode.',
    examples: ['complete hizli kapat', 'fast closeout yap'],
    patterns: [
      /\b(?:complete|closeout|kapanis)(?:\s+(?:kismini|adimini))?\s+(?:hizli|fast)\b/,
      /\bfast\s+closeout\b/,
    ],
  },
  {
    id: 'automation_manual',
    family: 'automation_control',
    label: 'Set automation to manual',
    risk: 'medium',
    action: 'set_automation_mode',
    mode: 'manual',
    resolution: 'direct',
    summary: 'Keep workflow automation manual.',
    examples: ['manuel gidelim', 'ben yoneteyim', 'automation manual'],
    patterns: [
      /\b(?:automation\s+manual|manual\s+automation)\b/,
      /\b(?:manuel\s+gidelim|ben\s+yoneteyim|tek\s+tek\s+gidelim)\b/,
    ],
  },
  {
    id: 'automation_full',
    family: 'automation_control',
    label: 'Set automation to full',
    risk: 'medium',
    action: 'set_automation_mode',
    mode: 'full',
    resolution: 'direct',
    summary: 'Allow workflow automation to keep going until blocked or complete.',
    examples: ['tam otomasyona al', 'sen bitir', 'automation full'],
    patterns: [
      /\b(?:automation\s+full|full\s+automation)\b/,
      /\b(?:tam\s+otomasyona\s+al|sen\s+bitir|sona\s+kadar\s+sen\s+git)\b/,
    ],
  },
  {
    id: 'automation_phase',
    family: 'automation_control',
    label: 'Set automation to phase',
    risk: 'medium',
    action: 'set_automation_mode',
    mode: 'phase',
    resolution: 'direct',
    summary: 'Allow workflow automation to finish the current phase before pausing.',
    examples: ['buradan sonra sen akit', 'sen devam et', 'automation phase'],
    patterns: [
      /\b(?:automation\s+phase|phase\s+automation)\b/,
      /\b(?:buradan\s+sonra\s+sen\s+akit|sen\s+akit|sen\s+devam\s+et)\b/,
    ],
  },
  {
    id: 'parallel_on',
    family: 'parallel_control',
    label: 'Activate parallel routing',
    risk: 'low',
    action: 'set_parallel_mode',
    state: 'on',
    resolution: 'direct',
    summary: 'Treat the utterance as an explicit request for Team Lite / parallel routing.',
    examples: ['parallel yap', 'subagent kullan', 'team lite'],
    patterns: [
      /\bparallel\s+yap\b/,
      /\bparalel\s+yap\b/,
      /\bparallelize\b/,
      /\bsubagent(?:s)?\b/,
      /\bsubagent\s+kullan\b/,
      /\bdelegate\s+et\b/,
      /\bdelegation\b/,
      /\bteam\s+mode\b/,
      /\bteam\s+lite\b/,
    ],
  },
  {
    id: 'tempo_lite',
    family: 'tempo_control',
    label: 'Use lite tempo',
    risk: 'low',
    action: 'set_tempo',
    mode: 'lite',
    resolution: 'direct',
    summary: 'Reduce ritual and move in lite tempo.',
    examples: ['detaya girmeyelim hizli gec', 'kisaca gec', 'lite mod'],
    patterns: [
      /\b(?:detaya\s+girmeyelim|hizli\s+gec(?:elim)?|kisaca\s+gec(?:elim)?|lite\s+mod)\b/,
    ],
  },
  {
    id: 'tempo_standard',
    family: 'tempo_control',
    label: 'Use standard tempo',
    risk: 'low',
    action: 'set_tempo',
    mode: 'standard',
    resolution: 'direct',
    summary: 'Use standard workflow tempo.',
    examples: ['standart git', 'normal tempoda git'],
    patterns: [
      /\b(?:standart\s+git|standard\s+git|normal\s+tempoda\s+git)\b/,
    ],
  },
  {
    id: 'tempo_full',
    family: 'tempo_control',
    label: 'Use full tempo',
    risk: 'low',
    action: 'set_tempo',
    mode: 'full',
    resolution: 'direct',
    summary: 'Use the fullest workflow tempo.',
    examples: ['detayli git', 'full tempo', 'derin git'],
    patterns: [
      /\b(?:detayli\s+git|full\s+tempo|derin\s+git)\b/,
    ],
  },
  {
    id: 'pause',
    family: 'pause_resume_control',
    label: 'Pause the workflow',
    risk: 'low',
    action: 'set_pause_state',
    state: 'pause',
    resolution: 'direct',
    summary: 'Pause here and preserve continuity.',
    examples: ['burada duralim', 'pause', 'dur'],
    patterns: [
      /\bburada\s+duralim\b/,
      /\bpause\b/,
      /\bdur\b/,
    ],
  },
  {
    id: 'resume',
    family: 'pause_resume_control',
    label: 'Resume the workflow',
    risk: 'low',
    action: 'set_pause_state',
    state: 'resume',
    resolution: 'direct',
    summary: 'Resume from the current continuity checkpoint.',
    examples: ['devam et', 'buradan surdur', 'resume'],
    patterns: [
      /\bdevam\s+et\b/,
      /\bburadan\s+surdur\b/,
      /\bresume\b/,
    ],
  },
  {
    id: 'context_checkpoint',
    family: 'context_control',
    label: 'Create a checkpoint',
    risk: 'low',
    action: 'checkpoint',
    resolution: 'direct',
    summary: 'Create a continuity checkpoint before changing context.',
    examples: ['checkpoint al'],
    patterns: [
      /\bcheckpoint\s+al\b/,
    ],
  },
  {
    id: 'context_compact',
    family: 'context_control',
    label: 'Compact the working set',
    risk: 'medium',
    action: 'compact',
    resolution: 'direct',
    summary: 'Compact the working set after continuity is safe.',
    examples: ['compact et'],
    patterns: [
      /\bcompact\s+et\b/,
    ],
  },
  {
    id: 'context_handoff',
    family: 'context_control',
    label: 'Create a handoff',
    risk: 'medium',
    action: 'handoff',
    resolution: 'direct',
    summary: 'Create a handoff packet for continuity.',
    examples: ['handoff olustur'],
    patterns: [
      /\bhandoff\s+olustur\b/,
    ],
  },
]);

function workflowControlExamplesForFamily(family, limit = 3) {
  const examples = [];

  for (const entry of WORKFLOW_CONTROL_CATALOG) {
    if (entry.family !== family) {
      continue;
    }

    for (const example of entry.examples || []) {
      if (!examples.includes(example)) {
        examples.push(example);
      }
    }
  }

  return examples.slice(0, limit);
}

function formatWorkflowControlCommand(utterance = '<user request>') {
  const escaped = String(utterance).replace(/"/g, '\\"');
  return `npm run workflow:control -- --utterance "${escaped}"`;
}

function workflowControlRecommendedCommand(intent, utterance = '<user request>') {
  if (!intent || !intent.matched) {
    return null;
  }

  if (intent.family === 'step_control') {
    const escaped = String(utterance).replace(/"/g, '\\"');
    return `npm run workflow:step-fulfillment -- --utterance "${escaped}"`;
  }

  if (intent.family === 'automation_control' && intent.mode) {
    return `npm run workflow:automation -- --mode ${intent.mode}`;
  }

  if (intent.family === 'tempo_control' && intent.mode) {
    const escaped = String(utterance).replace(/"/g, '\\"');
    return `npm run workflow:tempo -- --utterance "${escaped}"`;
  }

  if (intent.family === 'parallel_control') {
    const escaped = String(utterance).replace(/"/g, '\\"');
    return `npm run workflow:delegation-plan -- --activation-text "${escaped}"`;
  }

  if (intent.family === 'pause_resume_control' && intent.state === 'resume') {
    return 'npm run workflow:resume-work';
  }

  if (intent.family === 'context_control' && intent.action === 'checkpoint') {
    return 'npm run workflow:checkpoint -- --next "Resume here"';
  }

  return null;
}

function resolveWorkflowControlIntent(utterance) {
  const rawUtterance = String(utterance || '').trim();
  const normalizedUtterance = normalizeWorkflowControlUtterance(rawUtterance);

  if (!normalizedUtterance) {
    return {
      matched: false,
      utterance: rawUtterance,
      normalizedUtterance,
      family: 'unknown',
      label: 'No workflow control intent',
      risk: 'low',
      action: 'noop',
      resolution: 'noop',
      summary: 'No supported workflow control intent matched the utterance.',
      examples: [],
    };
  }

  for (const entry of WORKFLOW_CONTROL_CATALOG) {
    const matchedPattern = entry.patterns.find((pattern) => pattern.test(normalizedUtterance));
    if (!matchedPattern) {
      continue;
    }

    return {
      matched: true,
      utterance: rawUtterance,
      normalizedUtterance,
      matchId: entry.id,
      family: entry.family,
      label: entry.label,
      risk: entry.risk,
      action: entry.action,
      resolution: entry.resolution,
      summary: entry.summary,
      target: entry.target || null,
      mode: entry.mode || null,
      state: entry.state || null,
      examples: [...(entry.examples || [])],
    };
  }

  return {
    matched: false,
    utterance: rawUtterance,
    normalizedUtterance,
    family: 'unknown',
    label: 'No workflow control intent',
    risk: 'low',
    action: 'noop',
    resolution: 'noop',
    summary: 'No supported workflow control intent matched the utterance.',
    examples: [],
  };
}

module.exports = {
  foldTurkishAscii,
  formatWorkflowControlCommand,
  normalizeWorkflowControlUtterance,
  resolveWorkflowControlIntent,
  workflowControlExamplesForFamily,
  workflowControlRecommendedCommand,
};
