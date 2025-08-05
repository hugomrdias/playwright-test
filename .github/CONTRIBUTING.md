# Contributing to Template

Thank you for helping to improve the project! We are so happy that you are contributing! 💖

You can contribute to the project at any level. Whether you are new to web development or have been at it for ages doesn't matter. We can use your help!

**No contribution is too small, and all contributions are valued.**

This guide will help you to get started. It includes many details, but don't let that turn you away. Consider this a map to help you navigate the process, and please reach out to us with any questions and concerns in the our public [channel] .

## Conduct

Please review our [Code of Conduct] which describes the behavior we expect from all contributors. Please be kind, inclusive, and considerate when interacting with contributors and maintainers.

## Contributing in issues

You can contribute by [opening an issue][issue] to request a feature or report a bug. We also welcome comments on an issue, bug reproductions, and pull requests if you see how to address an issue.

If you are still determining the details of a feature request, you can start with a [discussion][discussions] where we can informally discuss what you have on your mind.

**Anyone can participate in any stage of contribution**. We urge you to
join in the discussion around bugs and comment on pull requests.

### Asking for help

If you have reviewed our [documentation][docs] and still have questions or are having problems, ask for help in the our public [channel] or [start a discussion][discussions].

### Submitting a bug report

We provide a template to give you a starting point when submitting a bug report. Please fill this template in with all relevant information, but feel free to delete any sections that do not apply.

The most important information is describing the problem and how it impacts you. We also invite you to propose a solution, which could be a description of expected behavior.

We very much appreciate it if you could include a [short, self-contained, correct example][sscce] that demonstrates the issue.

## Development

If you have been assigned to fix an issue or develop a new feature, please follow these steps to get started:

- Fork this repository.
- Install dependencies by running `pnpm install`.
  - We use [pnpm](https://pnpm.io/) for package management.
  - Make sure you have Node LTS installed in your system.
- Optionally run `npx simple-git-hooks` to install git hooks for linting and formatting.
- Implement your changes to files in the `src/` directory and corresponding test files in the `/test` directory.
- Git stage your required changes and commit (see below commit [guidelines](#how-should-i-write-my-commits)).
- Submit PR for review

### Codespaces

This repo has a dev container configuration to enable one click setup of a development environment using Codespaces.

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)][codespaces]

## Pull requests

Pull requests are how we make changes.

Even tiny pull requests to fix typos or improve comments are welcome. Before submitting a significant PR, it is usually best to start by [opening an issue][issue] or [starting a discusssion][discussions]. Taking one of these steps increases the likelihood that your PR will be merged.

All commits must be signed before a pull request will be accepted. See the GitHub [signing commits][signing] and [telling git about your signing key][telling-git] documentation. We recommend generating a new SSH key for signing if you are setting up signing for the first time.

We squash and merge all PRs. Orderly, well-written commits will help us during review, but we don't require a pristine commit history.

### Tests

If your change alters existing code, please run the test suites:

```sh
pnpm run lint
pnpm run test

# node tests can use native watch mode
pnpm test:node -n watch

# browser tests can enable watch
pnpm test:browser --watch
```

If you are adding a new feature, please add tests that prove the code works correctly and reference them when you submit the pull request.

### Opening a pull request

We provide a [pull request template][template] to give you a starting point when creating a pull request. Please fill this template in, but feel free to delete any sections that do not apply or that you are unsure about.

### Discuss and update

You will likely receive feedback or requests for changes to your pull request. Don't be discouraged! Pull request reviews help us all to collaborate and produce better code. Some reviewers may sign off immediately, and others may have more detailed comments and feedback. It's all part of the process of evaluating whether the changes are correct and necessary.

**Once the PR is open, do not rebase the commits.** Add more commits to address feedback. We will squash and merge all contributions, and we may clean up the history recorded in the final commit.

### Merging

The primary goals for a pull request are to improve the codebase and for the contributor to succeed. Some pull requests may not be merged at the end of the day, but that does not indicate failure. If your pull request is not merged, please know that your efforts are appreciated and will have an impact on how we think about the codebase in the long run.

## Release Process

[Release Please](https://github.com/googleapis/release-please) automates CHANGELOG generation, the creation of GitHub releases,
and version bumps for our packages. Release Please does so by parsing your
git history, looking for [Conventional Commit messages](https://www.conventionalcommits.org/),
and creating release PRs.

### What's a Release PR?

Rather than continuously releasing what's landed to our default branch, release-please maintains Release PRs:

These Release PRs are kept up-to-date as additional work is merged. When we're ready to tag a release, we simply merge the release PR.

When the release PR is merged the release job is triggered to create a new tag, a new github release and run other package specific jobs. Only merge ONE release PR at a time and wait for CI to finish before merging another.

Release PRs are created individually for each package in the mono repo.

### How should I write my commits?

Release Please assumes you are using [Conventional Commit messages](https://www.conventionalcommits.org/).

The most important prefixes you should have in mind are:

- `fix:` which represents bug fixes, and correlates to a [SemVer](https://semver.org/)
  patch.
- `feat:` which represents a new feature, and correlates to a SemVer minor.
- `feat!:`, or `fix!:`, `refactor!:`, etc., which represent a breaking change
  (indicated by the `!`) and will result in a SemVer major.

[channel]: https://github.com/hugomrdias/playwright-test/discussions
[codespaces]: https://codespaces.new/hugomrdias/playwright-test
[discussions]: https://github.com/hugomrdias/playwright-test/discussions
[issue]: https://github.com/hugomrdias/playwright-test/issues
[docs]: https://hugomrdias.github.io/playwright-test/
[sscce]: http://www.sscce.org/
[signing]: https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits
[telling-git]: https://docs.github.com/en/authentication/managing-commit-signature-verification/telling-git-about-your-signing-key
[template]: PULL_REQUEST_TEMPLATE.md
[Code of Conduct]: CODE_OF_CONDUCT.md
