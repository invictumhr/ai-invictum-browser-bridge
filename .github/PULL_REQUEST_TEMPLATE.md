## Summary

Describe the problem, the chosen design, and the observable result.

## Verification

- [ ] `pnpm security:secrets`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test:unit`
- [ ] `pnpm test:integration`
- [ ] `pnpm build`
- [ ] Real-Chrome verification was completed, or the reason it is not applicable is documented.

## Browser action checklist

- [ ] Contracts, strict validation, timeout/error mapping, policy, and audit behavior are covered.
- [ ] Authorization and risk level match the action's real effect.
- [ ] Results are bounded and do not expose secrets, control values, local paths, or private page data.
- [ ] Reservation, debugger references, temporary state, and tab cleanup succeed in `finally`.
- [ ] A typed action was preferred over raw JavaScript or coordinate automation.
- [ ] Current documentation and capability tests were updated where applicable.

## Compatibility

Describe protocol, extension reload, migration, or backward-compatibility implications.

## Screenshots or logs

Include only sanitized fixture evidence. Never attach production administration
screens, credentials, tokens, cookies, private URLs, or raw terminal output.
