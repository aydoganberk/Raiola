function stripTags(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function firstMatch(content, pattern) {
  return content.match(pattern)?.[1] || '';
}

function stripTagContents(value) {
  return stripTags(String(value || ''));
}

function collectTagMatches(body, tagName) {
  return [...String(body || '').matchAll(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi'))];
}

function extractVisualSignals(body) {
  const title = stripTags(firstMatch(body, /<title[^>]*>([\s\S]*?)<\/title>/i));
  const heading = stripTags(firstMatch(body, /<h1[^>]*>([\s\S]*?)<\/h1>/i))
    || stripTags(firstMatch(body, /<h2[^>]*>([\s\S]*?)<\/h2>/i));
  const mainBody = firstMatch(body, /<main[^>]*>([\s\S]*?)<\/main>/i);
  const mainText = stripTags(mainBody);
  const bodyText = stripTags(firstMatch(body, /<body[^>]*>([\s\S]*?)<\/body>/i) || body);
  const snippet = (mainText || bodyText).slice(0, 280);
  const hasMain = /<main[\s>]/i.test(body);
  const hasHeading = /<h[1-3][\s>]/i.test(body);
  const hasNav = /<nav[\s>]/i.test(body);
  const hasForm = /<form[\s>]/i.test(body);
  const hasButton = /<button[\s>]|type=["']submit["']/i.test(body);
  const signalScore = [
    Boolean(title),
    Boolean(heading),
    hasMain,
    hasHeading,
    hasNav,
    hasForm,
    hasButton,
  ].filter(Boolean).length;

  return {
    title,
    heading,
    snippet,
    hasMain,
    hasHeading,
    hasNav,
    hasForm,
    hasButton,
    signalScore,
  };
}

function extractAccessibilitySignals(body) {
  const issues = [];
  const pushIssue = (severity, rule, detail) => {
    issues.push({ severity, rule, detail });
  };
  const htmlTag = body.match(/<html\b([^>]*)>/i)?.[1] || '';
  const hasLang = /\blang\s*=\s*["'][^"']+["']/i.test(htmlTag);
  if (!hasLang) {
    pushIssue('medium', 'document-lang', 'The root html element does not declare a lang attribute.');
  }
  if (!/<main[\s>]/i.test(body)) {
    pushIssue('medium', 'landmark-main', 'A main landmark was not detected in the document.');
  }

  const images = [...String(body || '').matchAll(/<img\b([^>]*)>/gi)];
  const imagesWithoutAlt = images.filter((match) => !/\balt\s*=\s*["'][^"']*["']/i.test(match[1] || '')).length;
  if (imagesWithoutAlt > 0) {
    pushIssue('high', 'image-alt', `${imagesWithoutAlt} image element(s) are missing alt text.`);
  }

  const labelsByFor = new Set([...String(body || '').matchAll(/<label\b[^>]*for=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]));
  const fields = [...String(body || '').matchAll(/<(input|select|textarea)\b([^>]*)>/gi)];
  const unlabeledFields = fields.filter((match) => {
    const attrs = match[2] || '';
    if (/\btype\s*=\s*["']hidden["']/i.test(attrs)) {
      return false;
    }
    const id = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1] || '';
    return !labelsByFor.has(id) && !/\b(aria-label|aria-labelledby|title|placeholder)\s*=/.test(attrs);
  }).length;
  if (unlabeledFields > 0) {
    pushIssue('high', 'form-label', `${unlabeledFields} form control(s) do not expose an obvious accessible name.`);
  }

  const unlabeledButtons = collectTagMatches(body, 'button').filter((match) => {
    const attrs = match[0].match(/<button\b([^>]*)>/i)?.[1] || '';
    const text = stripTagContents(match[1] || '');
    return !text && !/(aria-label|aria-labelledby|title)\s*=/i.test(attrs);
  }).length;
  if (unlabeledButtons > 0) {
    pushIssue('high', 'button-name', `${unlabeledButtons} button element(s) do not expose an accessible name.`);
  }

  return {
    verdict: issues.some((issue) => issue.severity === 'high')
      ? 'fail'
      : issues.length > 0
        ? 'warn'
        : 'pass',
    issueCount: issues.length,
    issues,
    checks: {
      hasLang,
      hasMain: /<main[\s>]/i.test(body),
      imagesWithoutAlt,
      unlabeledFields,
      unlabeledButtons,
    },
  };
}

function extractJourneySignals(body) {
  const signals = {
    nav: /<nav[\s>]/i.test(body),
    main: /<main[\s>]/i.test(body),
    heading: /<h[1-2][\s>]/i.test(body),
    primaryAction: /<button[\s>]|type=["']submit["']|<a\b[^>]*>([\s\S]*?(start|get started|continue|save|submit|buy|ship|next))/i.test(body),
    form: /<form[\s>]|<(input|select|textarea)\b/i.test(body),
    feedback: /\b(loading|spinner|skeleton|error|retry|success|saved|empty state|no results|aria-live)\b/i.test(body),
  };
  const missing = Object.entries(signals)
    .filter(([, present]) => !present)
    .map(([key]) => key)
    .filter((key) => !['form', 'feedback', 'nav'].includes(key));
  return {
    coverage: missing.length === 0
      ? 'pass'
      : missing.length <= 2
        ? 'warn'
        : 'incomplete',
    signals,
    missing,
    summary: missing.length === 0
      ? 'Core journey signals were detected.'
      : `Missing journey signals: ${missing.join(', ')}.`,
  };
}

function extractMetadataSignals(body) {
  const head = firstMatch(body, /<head[^>]*>([\s\S]*?)<\/head>/i) || body;
  const findMeta = (names) => {
    for (const name of names) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const direct = head.match(new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'));
      if (direct?.[1]) {
        return direct[1];
      }
      const inverse = head.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, 'i'));
      if (inverse?.[1]) {
        return inverse[1];
      }
    }
    return '';
  };
  const canonical = head.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i)?.[1]
    || head.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i)?.[1]
    || '';
  const lang = body.match(/<html\b[^>]*\blang=["']([^"']+)["']/i)?.[1] || '';
  const viewport = findMeta(['viewport']);
  const description = findMeta(['description', 'og:description']);
  const ogTitle = findMeta(['og:title']);
  const robots = findMeta(['robots']);
  const themeColor = findMeta(['theme-color']);

  return {
    title: stripTags(firstMatch(head, /<title[^>]*>([\s\S]*?)<\/title>/i)),
    description,
    canonical,
    lang,
    viewport: {
      present: Boolean(viewport),
      content: viewport,
    },
    ogTitle,
    themeColor,
    robots,
    noindex: /\bnoindex\b/i.test(robots),
  };
}

function extractUiContractSignals(body) {
  const landmarks = {
    header: /<header[\s>]/i.test(body),
    nav: /<nav[\s>]/i.test(body),
    main: /<main[\s>]/i.test(body) || /role=["']main["']/i.test(body),
    footer: /<footer[\s>]/i.test(body),
    aside: /<aside[\s>]/i.test(body),
    search: /role=["']search["']|<search[\s>]/i.test(body),
  };
  const patterns = {
    form: /<form[\s>]|<(input|select|textarea)\b/i.test(body),
    dialog: /<dialog\b|role=["']dialog["']/i.test(body),
    table: /<table\b/i.test(body),
    list: /<(ul|ol)\b/i.test(body),
    tabs: /role=["']tab(list|panel)?["']/i.test(body),
    breadcrumb: /breadcrumb/i.test(body) && /aria-label=|role=["']navigation["']/i.test(body),
    pagination: /pagination/i.test(body) || /rel=["']next["']/i.test(body),
    status: /aria-live=|role=["'](?:status|alert)["']/i.test(body),
    button: /<button\b/i.test(body),
    link: /<a\b/i.test(body),
  };
  const stateMarkers = {
    loading: /\b(loading|spinner|skeleton|pending)\b/i.test(body),
    empty: /\b(no results|no items|nothing here|empty state|empty)\b/i.test(body),
    error: /\b(error|retry|failed|try again)\b/i.test(body),
    success: /\b(success|saved|completed|done)\b/i.test(body),
    auth: /\b(sign in|log in|authenticate|permission denied|forbidden|unauthorized)\b/i.test(body),
  };

  const missing = [];
  if (!landmarks.main) {
    missing.push('main');
  }
  if (!patterns.button && !patterns.link) {
    missing.push('primary-action-surface');
  }
  const richPatternCount = Object.entries(patterns)
    .filter(([key, value]) => value && !['button', 'link'].includes(key))
    .length;
  const landmarkCount = Object.values(landmarks).filter(Boolean).length;
  const verdict = missing.length > 0
    ? 'warn'
    : richPatternCount >= 2 || landmarkCount >= 3
      ? 'pass'
      : 'note';
  const summary = verdict === 'pass'
    ? 'The page exposes enough UI structure to support a focused browser review.'
    : verdict === 'warn'
      ? `The page is missing some core UI structure: ${missing.join(', ')}.`
      : 'The page has basic UI structure, but richer component contracts were not obvious from the markup.';

  return {
    verdict,
    landmarks,
    patterns,
    stateMarkers,
    missing,
    summary,
  };
}

function buildAccessibilityTreeFromHtml(body) {
  const headings = [...String(body || '').matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((match) => ({
    role: 'heading',
    level: Number(match[1]),
    name: stripTags(match[2] || ''),
  })).filter((entry) => entry.name);
  const links = [...String(body || '').matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => ({
    role: 'link',
    name: stripTags(match[1] || ''),
  })).filter((entry) => entry.name).slice(0, 25);
  const buttons = collectTagMatches(body, 'button').map((match) => ({
    role: 'button',
    name: stripTags(match[1] || ''),
  })).filter((entry) => entry.name).slice(0, 25);
  const landmarks = [
    /<main[\s>]/i.test(body) ? { role: 'main', name: 'main' } : null,
    /<nav[\s>]/i.test(body) ? { role: 'navigation', name: 'navigation' } : null,
    /<form[\s>]/i.test(body) ? { role: 'form', name: 'form' } : null,
  ].filter(Boolean);
  return {
    role: 'document',
    name: stripTags(firstMatch(body, /<title[^>]*>([\s\S]*?)<\/title>/i)) || 'document',
    children: [...landmarks, ...headings.slice(0, 20), ...buttons, ...links],
  };
}

function wrapText(value, limit = 72, maxLines = 4) {
  const words = String(value || '').split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }

  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= limit) {
      current = next;
      continue;
    }
    if (current) {
      lines.push(current);
    }
    current = word;
    if (lines.length >= maxLines) {
      break;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, Math.max(0, limit - 3))}...`;
  }

  return lines;
}

function buildSummarySvg(payload) {
  const lines = [
    ...wrapText(payload.title || 'Untitled page', 34, 2),
    ...wrapText(payload.heading || payload.url, 48, 2),
    ...wrapText(payload.snippet || 'No readable body text was captured from the response.', 62, 5),
  ];
  const lineHeight = 34;
  const startY = 214;
  const textNodes = lines
    .map((line, index) => `<text x="84" y="${startY + (index * lineHeight)}" fill="#0f172a" font-size="${index < 2 ? 28 : 22}" font-family="Menlo, Monaco, 'Courier New', monospace">${escapeXml(line)}</text>`)
    .join('\n');
  const badges = [
    `HTTP ${payload.statusCode || 'n/a'}`,
    `transport ${payload.verdict}`,
    `visual ${payload.visualVerdict}`,
    payload.renderer,
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" role="img" aria-label="Browser verification summary">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#e0f2fe"/>
      <stop offset="100%" stop-color="#fef3c7"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <rect x="48" y="44" width="1184" height="632" rx="28" fill="#fffbeb" stroke="#0f172a" stroke-width="3"/>
  <text x="84" y="112" fill="#0f172a" font-size="36" font-family="Menlo, Monaco, 'Courier New', monospace">VERIFY BROWSER</text>
  <text x="84" y="154" fill="#334155" font-size="22" font-family="Menlo, Monaco, 'Courier New', monospace">${escapeXml(payload.url)}</text>
  <rect x="84" y="564" width="1112" height="72" rx="18" fill="#ffffff" stroke="#cbd5e1"/>
  <text x="110" y="608" fill="#334155" font-size="22" font-family="Menlo, Monaco, 'Courier New', monospace">${escapeXml(badges.join(' | '))}</text>
  <text x="84" y="520" fill="#475569" font-size="20" font-family="Menlo, Monaco, 'Courier New', monospace">signals: title=${payload.signals.title ? 'yes' : 'no'} heading=${payload.signals.hasHeading ? 'yes' : 'no'} main=${payload.signals.hasMain ? 'yes' : 'no'} nav=${payload.signals.hasNav ? 'yes' : 'no'} form=${payload.signals.hasForm ? 'yes' : 'no'} button=${payload.signals.hasButton ? 'yes' : 'no'}</text>
  ${textNodes}
</svg>
`;
}

function deriveVisualVerdict({ errorMessage, htmlLike, statusCode, signals }) {
  if (errorMessage || statusCode >= 400) {
    return 'fail';
  }
  if (!htmlLike) {
    return 'inconclusive';
  }
  if (signals.signalScore >= 2) {
    return 'pass';
  }
  return 'inconclusive';
}

module.exports = {
  buildAccessibilityTreeFromHtml,
  buildSummarySvg,
  collectTagMatches,
  deriveVisualVerdict,
  escapeXml,
  extractAccessibilitySignals,
  extractJourneySignals,
  extractMetadataSignals,
  extractUiContractSignals,
  extractVisualSignals,
  firstMatch,
  stripTags,
  stripTagContents,
};
