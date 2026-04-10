# Security Checklist

- Validate input at trust boundaries.
- Keep secrets out of source, logs, prompts, and screenshots.
- Check authn and authz whenever protected data or actions changed.
- Prefer safe defaults for feature flags, rollout switches, and optional behavior.
- Review third-party calls, redirects, and file operations for obvious abuse paths.
- Document any residual security risk before ship.
