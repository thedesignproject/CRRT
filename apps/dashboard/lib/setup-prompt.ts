/** The one prompt a coding agent needs to install the widget for this project. */
export function setupPrompt(projectId: string) {
  return `Set up CRRT visual feedback in this React app.

1. Install @thedesignproject/crrt with the project's package manager.
2. Render <FeedbackWidget projectId="${projectId}" /> once at the root so it shows on every page. Check package.json for the framework: in Next.js App Router, wrap it in a client component inside <body> in app/layout.tsx.
3. If the app owns light/dark theme state, pass it to the theme prop. Otherwise leave theme out.
4. Add a note to AGENTS.md: "Review feedback for this app lives in CRRT, project ${projectId}."

Follow the existing conventions. Don't refactor unrelated code.`
}
