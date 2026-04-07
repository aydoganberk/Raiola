const { readText } = require('./io/files');
const { getFieldValue } = require('./markdown/sections');
const { parseTableSectionObjects } = require('./common_tables');
const { checkReference, parseReferenceList } = require('./common_references');

function runEvidenceChecks(paths, options = {}) {
  const cwd = options.cwd || process.cwd();
  const context = readText(paths.context);
  const checks = [];
  const assumptions = parseTableSectionObjects(context, 'Clarifying Questions / Assumptions');
  const claimLedger = parseTableSectionObjects(context, 'Claim Ledger');

  for (const assumption of assumptions) {
    if (!assumption.claim) {
      continue;
    }

    const refs = parseReferenceList(assumption.evidence_refs);
    if (refs.length === 0) {
      checks.push({
        status: 'fail',
        kind: 'assumption',
        claim: assumption.claim,
        message: 'Assumption missing evidence refs',
      });
      continue;
    }

    for (const ref of refs) {
      const result = checkReference(cwd, ref, { rootDir: paths.rootDir });
      checks.push({
        status: result.status,
        kind: 'assumption',
        claim: assumption.claim,
        ref,
        message: result.message,
      });
    }
  }

  for (const claim of claimLedger) {
    if (!claim.claim) {
      continue;
    }

    const refs = parseReferenceList(claim.evidence_refs);
    if (refs.length === 0) {
      checks.push({
        status: claim.type === 'source-backed' ? 'fail' : 'warn',
        kind: 'claim',
        claim: claim.claim,
        message: 'Claim missing evidence refs',
      });
      continue;
    }

    for (const ref of refs) {
      const result = checkReference(cwd, ref, { rootDir: paths.rootDir });
      checks.push({
        status: result.status,
        kind: 'claim',
        claim: claim.claim,
        ref,
        message: result.message,
      });
    }
  }

  return checks;
}

function parseValidationContract(content) {
  return parseTableSectionObjects(content, 'Validation Contract');
}

function validateValidationContract(paths) {
  const status = readText(paths.status);
  const validation = readText(paths.validation);
  const milestone = String(getFieldValue(status, 'Current milestone') || 'NONE').trim();
  const rows = parseValidationContract(validation);
  const issues = [];
  const frontendMode = String(getFieldValue(validation, 'Frontend mode') || 'inactive').trim().toLowerCase();
  const visualVerdictRequired = String(getFieldValue(validation, 'Visual verdict required') || 'no').trim().toLowerCase() === 'yes';

  if (rows.length === 0) {
    issues.push({
      status: milestone === 'NONE' ? 'warn' : 'fail',
      message: 'Validation Contract tablosu bos',
    });
    return issues;
  }

  for (const row of rows) {
    const requiredFields = [
      ['deliverable', 'Deliverable'],
      ['verify_command', 'Verify command'],
      ['expected_signal', 'Expected signal'],
      ['manual_check', 'Manual check'],
      ['golden', 'Golden'],
      ['audit_owner', 'Audit owner'],
      ['status', 'Status'],
      ['evidence', 'Evidence'],
      ['packet_hash', 'Packet hash'],
    ];

    for (const [fieldKey, fieldLabel] of requiredFields) {
      if (!String(row[fieldKey] || '').trim()) {
        issues.push({
          status: milestone === 'NONE' ? 'warn' : 'fail',
          message: `Validation row missing ${fieldLabel}`,
          row,
        });
      }
    }
  }

  if (frontendMode === 'active' || visualVerdictRequired) {
    const profileRef = String(getFieldValue(validation, 'Frontend profile ref') || '').trim();
    const adapterRoute = String(getFieldValue(validation, 'Frontend adapter route') || '').trim();
    const verdictRows = parseTableSectionObjects(validation, 'Visual Verdict');
    const requiredAreas = new Set([
      'responsive',
      'interaction',
      'visual consistency',
      'component reuse',
      'accessibility smoke',
      'screenshot evidence',
    ]);

    if (!profileRef) {
      issues.push({
        status: milestone === 'NONE' ? 'warn' : 'fail',
        message: 'Frontend validation missing Frontend profile ref',
      });
    }

    if (!adapterRoute || adapterRoute.toLowerCase() === 'none') {
      issues.push({
        status: milestone === 'NONE' ? 'warn' : 'fail',
        message: 'Frontend validation missing adapter route',
      });
    }

    if (verdictRows.length === 0) {
      issues.push({
        status: milestone === 'NONE' ? 'warn' : 'fail',
        message: 'Frontend validation missing Visual Verdict table',
      });
    } else {
      const coveredAreas = new Set();
      for (const row of verdictRows) {
        const area = String(row.verdict_area || '').trim().toLowerCase();
        if (area) {
          coveredAreas.add(area);
        }

        const requiredFields = [
          ['verdict_area', 'Verdict area'],
          ['expectation', 'Expectation'],
          ['how_to_observe', 'How to observe'],
          ['evidence_expectation', 'Evidence expectation'],
          ['status', 'Status'],
        ];

        for (const [fieldKey, fieldLabel] of requiredFields) {
          if (!String(row[fieldKey] || '').trim()) {
            issues.push({
              status: milestone === 'NONE' ? 'warn' : 'fail',
              message: `Visual Verdict row missing ${fieldLabel}`,
              row,
            });
          }
        }
      }

      for (const area of requiredAreas) {
        if (!coveredAreas.has(area)) {
          issues.push({
            status: milestone === 'NONE' ? 'warn' : 'fail',
            message: `Visual Verdict missing ${area}`,
          });
        }
      }
    }
  }

  return issues;
}

module.exports = {
  parseValidationContract,
  runEvidenceChecks,
  validateValidationContract,
};
