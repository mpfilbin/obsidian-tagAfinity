# Security policy

## Supported versions

Only the latest release of Tagafinity receives security fixes. Please reproduce a problem on the latest release before reporting it.

## Reporting a vulnerability

Please report suspected vulnerabilities **privately**, not in a public issue or pull request.

Use GitHub's private vulnerability reporting: open the repository's **Security** tab, choose **Report a vulnerability**, and describe the problem there.

A useful report includes:

* the Tagafinity and Obsidian versions and your operating system;
* what an attacker needs (for example, "a note in the vault", "write access to the plugin folder", "control of a download host");
* steps or a minimal note/payload that reproduces it, and what you observed;
* the impact you expect.

Please use fake data. Do not test against other people's vaults, and do not send exploit traffic to third-party hosts.

This is a small, maintainer-run project. Reports are handled on a best-effort basis; there is no guaranteed response time.

## Scope

In scope: the plugin source in this repository, its build and release workflows, and the artifacts attached to GitHub releases.

Out of scope: vulnerabilities in Obsidian itself, in other plugins, or in third-party services the plugin downloads from (Hugging Face, jsdelivr). Report those to their owners. If Tagafinity's use of them is the problem, for example a missing integrity check, that is in scope.

## Known issues and threat model

The threat model in [docs/security/threat-model.md](docs/security/threat-model.md) lists the weaknesses already found, with ratings, proof-of-concept instructions and recommended fixes. Please read it before reporting, and refer to its IDs (for example `E-1`) if your report concerns a listed item. New findings and better proofs of concept for listed items are welcome.

## Disclosure

Please give the maintainer reasonable time to fix a problem before disclosing it publicly. Fixes are released through the normal GitHub release process and noted in the release notes.
