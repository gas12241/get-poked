# Claude Instructions

## Project Goal

Build a professional-quality Pokémon card collection and quiz application.

The project should emphasize:

- Clean architecture
- Maintainability
- Readability
- Testability
- Small incremental changes

---

## Workflow

Before writing code:

1. Read relevant project files.
2. Analyze the existing implementation.
3. Produce an implementation plan.
4. Wait for approval.
5. Implement.
6. Review your own work.

---

## Documentation First

If a requested feature changes any of the following:

- Architecture
- Database schema
- API endpoints
- Authentication flow
- Testing strategy
- Development workflow

Then:

1. Identify which documentation files should be updated.
2. Suggest the documentation changes before implementation.
3. Wait for approval if the changes are significant.
4. Keep documentation synchronized with the final implementation.

Documentation is considered part of the feature, not an afterthought.

---

## Coding Standards

- Prefer readable code over clever code.
- Never refactor unrelated files.
- Keep functions small.
- Avoid duplication.
- Follow existing project patterns.
- Explain major architectural decisions.

---

## Testing

Every backend feature requires appropriate tests.

Every frontend feature requires appropriate tests.

Bug fixes require regression tests.

Tests should verify behavior rather than implementation details.

Do not consider a feature complete until tests have been added.

---

## Git

Keep commits small and focused.

Use one feature per branch.

Use descriptive commit messages.

Do not mix unrelated changes in the same commit.

Never commit secrets.

---

## Backend Rules

The frontend should never communicate directly with the Pokémon TCG API.

Django is responsible for:

- Business logic
- Authentication
- Card import
- Image generation
- Database access

---

## Frontend Rules

React should focus on:

- UI
- User interactions
- API communication
- State management

Avoid putting business logic in React.

---

## Authentication

Support:

- Google OAuth
- Email/password authentication

Google OAuth should be the preferred onboarding experience.

---

## Documentation Maintenance

Maintain the following project documents:

- README.md
- CLAUDE.md
- ARCHITECTURE.md
- ROADMAP.md
- TODO.md
- docs/api.md
- docs/database.md
- docs/testing.md
- docs/decisions.md
- docs/ui-ideas.md
- docs/prompts.md
- docs/learning-guide.md

Update documentation whenever:

- Architecture changes
- APIs change
- Authentication changes
- Testing strategy changes
- Database schema changes

`docs/learning-guide.md` is the user's personal reference for understanding
and discussing the project (e.g. for interviews) — it is gitignored and must
never be committed. ARCHITECTURE.md is the public, canonical home for the
underlying technical substance (how each part of the system works and why);
when something meaningful is added there, check whether learning-guide.md
should be extended too, but the reverse never applies — nothing written for
learning-guide.md should be written assuming it will reach GitHub.

---

## Decision Making

When multiple implementation approaches are reasonable:

- Explain the trade-offs between approaches.
- Recommend an approach and explain why.
- Ask for approval before making significant architectural decisions.

Avoid introducing new dependencies, patterns, or major structural changes without first explaining the reasoning.

---

## Final Reminder

Prefer correctness over speed.

Small improvements are better than large risky rewrites.
