import type { Resource } from './model.ts'
import { additionalResources } from './additionalContent.ts'
export * from './model.ts'

export const resources: Resource[] = [
  {
    slug: 'design-tokens-for-ai-prototypes', track: 'design-systems',
    title: 'Design tokens for AI prototypes: start with one screen',
    seoTitle: 'Design tokens for AI prototypes: a starter guide',
    description: 'Create a small set of semantic design tokens that keeps AI-generated screens consistent. Includes a starter CSS file, prompt, and review checklist.',
    answer: 'Design tokens are named values for recurring design decisions, such as text color, spacing, and corner radius. For an AI prototype, start with the values used on one approved screen, name them by purpose, and ask your builder to reuse them before adding new styles.',
    takeaway: 'A small token file and a prompt your builder can reuse.',
    sections: [
      { id: 'choose-a-reference', title: '1. Choose a screen worth repeating', paragraphs: [
        'Use a screen that already feels like your product. A settings page with fields, buttons, headings, and a panel is a better starting point than a decorative landing-page hero. If the product is new, approve one representative screen before generating several more.',
        'List the decisions that repeat: page and panel backgrounds, primary and muted text, action and border colors, spacing, type sizes, and corner radii. Keep this first inventory small enough to review in one sitting. Record what is actually used rather than inventing a complete scale for hypothetical screens.',
      ] },
      { id: 'name-by-purpose', title: '2. Name values by their job', paragraphs: [
        'A name such as color-text-muted explains where a value belongs. A name such as gray-400 describes its appearance. Both can exist in a larger system, but a small prototype benefits from clear purpose-based names at the point of use.',
        'The following values are an illustrative starting point, not CRRT’s brand tokens. Replace them with your approved screen’s values. Keep the file in the repository so both people and coding agents can find it.',
      ], code: ':root {\n  --color-surface: #ffffff;\n  --color-text: #202329;\n  --color-text-muted: #646b75;\n  --color-action: #2256b8;\n  --color-border: #d9dce1;\n  --space-control: 12px;\n  --space-section: 24px;\n  --radius-control: 8px;\n}\n\n.form-panel {\n  background: var(--color-surface);\n  color: var(--color-text);\n  padding: var(--space-section);\n}' },
      { id: 'give-the-builder-rules', title: '3. Give the builder a bounded instruction', paragraphs: [
        'Provide the file path, an approved reference, and the screen to update. Ask the builder to report missing tokens before creating them. This gives you a chance to distinguish a genuine new need from a variation the existing system already covers.',
      ], code: 'Update the account settings screen using styles/tokens.css.\nUse the billing screen as the visual reference.\nReuse existing form and button components.\nReplace repeated raw values with the matching semantic tokens.\nPreserve the current copy, field behavior, and layout.\nList any missing token roles before adding them.\nShow the changed screen at narrow and wide widths.' },
      { id: 'review-the-result', title: '4. Review the screen and the change', paragraphs: [
        'Check the running page next to your reference. A token file can be correct while a component still overrides it locally. Inspect the implementation for repeated raw values and verify that focus, hover, disabled, and error states remain clear.',
        'When you find drift, point to one affected element and describe the rule it should follow. For example: “The secondary action uses a different radius from the other form controls. Reuse the control radius token.” CRRT can preserve the selected element and visual feedback when you hand an accepted correction to a coding agent.',
      ], items: ['Compare text and background pairs for readable contrast.', 'Test narrow layouts with long field labels and realistic content.', 'Check one second screen to confirm the tokens actually transfer.', 'Review new token additions and remove duplicate roles before merging.'] },
    ],
    questions: [
      { question: 'Do I need a complete design system before prototyping?', answer: 'No. Start with one approved screen, shared values, and a few reusable components. Expand the system when a real screen requires a new decision.' },
      { question: 'Can design tokens stop every visual inconsistency?', answer: 'No. Tokens standardize values. Layout, component behavior, content, and responsive decisions still need explicit instructions and review.' },
    ],
    sources: [{ label: 'Design Tokens Community Group: specification and terminology', href: 'https://www.designtokens.org/' }, { label: 'v0: using your own design system', href: 'https://v0.app/docs/design-systems-2' }],
    related: ['document-components-for-coding-agents', 'ui-review-checklist-ai-generated-apps'],
  },
  {
    slug: 'document-components-for-coding-agents', track: 'design-systems',
    title: 'How to document components for coding agents',
    seoTitle: 'Component documentation for coding agents',
    description: 'Help coding agents reuse your component library with clear usage rules, props, states, and examples. Start with one button and a practical component brief.',
    answer: 'A component brief for a coding agent should explain where the component lives, when to use it, its supported variants, and how to verify its behavior. Pair a working example with state and accessibility requirements so the agent can reuse an existing component with less guesswork.',
    takeaway: 'A reusable component brief for your existing library.',
    sections: [
      { id: 'pick-one-component', title: '1. Start with a component people keep rebuilding', paragraphs: [
        'Choose something used across several screens: a button, text field, modal, or status badge. Search the codebase first. The most useful first document often describes a component that already exists but is hard to discover.',
        'Identify its actual import path, exported name, supported props, and existing examples. Check those facts against the implementation. A beautiful document that teaches an invented API creates more work for the next person or agent.',
      ] },
      { id: 'write-a-brief', title: '2. Put the brief next to the code', paragraphs: [
        'Use a nearby Markdown file or your team’s existing documentation convention. Include an owner or contact if there is one. Link from the repository’s agent instructions to the component directory so the brief is discoverable at the start of a task.',
        'This example is a template. Replace the illustrative names and props with your component’s real API before using it in a project.',
      ], code: '# Button\nLocation: components/Button.tsx\nImport: import { Button } from "./components/Button"\n\nUse for: actions that change application state.\nUse a link for: navigation to another page.\nVariants: primary, secondary, destructive.\nStates: default, hover, focus, disabled, loading.\nRules: one primary action per decision area; preserve visible focus.\nExample: <Button variant="primary">Save changes</Button>\nVerify: keyboard activation, loading behavior, long labels, narrow widths.\nDo not add a new variant without reviewing existing options.' },
      { id: 'show-the-states', title: '3. Make the examples runnable', paragraphs: [
        'When your project uses Storybook, add a story for each meaningful state and use realistic labels. A story captures a rendered component state; it gives reviewers a stable place to inspect a change. Include an example in context as well, such as a button inside a confirmation dialog.',
        'Document what should happen during loading. Does the control preserve its width? Can a second activation send a duplicate request? How does a screen-reader user learn that work is in progress? These are behavior decisions that a visual screenshot cannot answer on its own.',
      ], items: ['Demonstrate the default and most common alternate variant.', 'Include disabled, loading, and error-adjacent examples where relevant.', 'Show keyboard focus and confirm that the accessible name remains useful.', 'Use a long label to reveal wrapping or truncation problems.'] },
      { id: 'test-discoverability', title: '4. Test whether the brief helps a real task', paragraphs: [
        'Ask your coding agent to add one existing component to a small screen. Tell it to read the brief first and identify which example it follows. Review whether it imported the shared component, used supported props, and avoided new local styles.',
        'If the agent rebuilds the component, check discovery before adding more documentation. The path may be missing from the project entry point, the example may not compile, or two competing components may have equally plausible names. Fix that ambiguity, then repeat the same small task.',
        'During review, attach feedback to the exact rendered instance. Describe which shared behavior or token it should inherit. Accept the correction before sending it for implementation, then verify the reusable component and its consumers before merging.',
      ] },
    ],
    questions: [
      { question: 'Should I document every component at once?', answer: 'Start with the components that are frequently duplicated or incorrectly used. A verified brief for one common control is more useful than an unverified inventory.' },
      { question: 'Does component documentation replace visual review?', answer: 'No. Documentation describes intended usage. Review confirms that the rendered result, surrounding layout, and interaction meet that intent.' },
    ],
    sources: [{ label: 'Storybook: writing component stories', href: 'https://storybook.js.org/docs/writing-stories' }, { label: 'Storybook: best practices for AI', href: 'https://storybook.js.org/docs/ai/best-practices' }],
    related: ['design-tokens-for-ai-prototypes', 'visual-feedback-for-coding-agents'],
  },
  {
    slug: 'visual-feedback-for-coding-agents', track: 'agentic-workflows',
    title: 'How to write visual feedback a coding agent can act on',
    seoTitle: 'Visual feedback for coding agents: a practical guide',
    description: 'Turn vague UI comments into bounded coding tasks. Use a visual feedback template with an exact target, desired outcome, constraints, and acceptance checks.',
    answer: 'Useful visual feedback identifies the exact element, explains the current problem, describes the intended outcome, and states how to verify the fix. Include the page, viewport, and relevant state. Give each comment one independently reviewable change.',
    takeaway: 'A copyable feedback template and a complete worked example.',
    sections: [
      { id: 'identify-the-target', title: '1. Anchor the comment to the running product', paragraphs: [
        '“Make this cleaner” leaves the implementer to guess both the problem and the solution. Start by selecting the element or describing its location precisely. Include the route, screen size, and application state, such as an empty account or a form with a validation error.',
        'A screenshot preserves appearance, while an element reference helps the agent locate the implementation. Neither proves the underlying cause. Describe what you observed without claiming a CSS or component diagnosis unless you have checked it.',
      ] },
      { id: 'describe-the-outcome', title: '2. State what should change and what should stay', paragraphs: [
        'Explain the effect on a person using the screen. “The save action disappears below the fold when validation messages appear” is more useful than “the spacing feels wrong.” Then define a result the reviewer can observe.',
        'Bound the task by naming any behavior, content, or adjacent screens that must remain intact. If a design-system rule already resolves the issue, reference that rule instead of proposing a new visual treatment. Separate unrelated issues so each change can be approved or rejected on its own.',
      ], code: 'Target: [route, element, viewport, and state]\nObserved: [what happens now and why it causes a problem]\nDesired: [the visible or behavioral result]\nReuse: [existing component, token, or approved reference]\nPreserve: [behavior, content, and scope boundaries]\nVerify: [steps and expected outcome]' },
      { id: 'worked-example', title: '3. Turn one observation into an actionable task', paragraphs: [
        'Suppose a founder is reviewing an account settings page on a phone. An email address pushes the save button outside the panel. A focused comment captures the situation without asking for a broader redesign.',
      ], code: 'Target: /settings/profile, account panel, 390px wide.\nObserved: a long email address causes horizontal scrolling.\nDesired: the email stays readable and Save remains inside the panel.\nReuse: the existing form layout and spacing tokens.\nPreserve: field labels, validation, and save behavior.\nVerify: use a long email at 390px and 1280px; confirm no horizontal\nscroll and complete a save using the keyboard.' },
      { id: 'review-and-hand-off', title: '4. Review the feedback before handing it off', paragraphs: [
        'Check that the request is still relevant and the desired outcome is clear. Decide which comments should be implemented. In CRRT, accepted visual feedback can be handed to a coding agent with its available context. Follow the agent handoff documentation for the connection and permission details.',
        'Ask the agent to explain its changes and report what it verified. Review the result in the same state and viewport as the original issue. Expand the review to nearby states if the fix touches a shared component. A completion message is a request for review; a person still decides whether the change should merge.',
      ], items: ['Confirm the target and issue are reproducible.', 'Remove duplicate or conflicting requests.', 'Use one observable acceptance check per intended outcome.', 'Reopen the original screen and verify the fix before merging.'] },
    ],
    questions: [
      { question: 'Should feedback include the exact CSS fix?', answer: 'Include a verified design rule or implementation constraint when it matters. Otherwise, describe the observable problem and desired result so the agent can inspect the code before choosing a fix.' },
      { question: 'Can I send several comments to an agent together?', answer: 'Yes, when they share a clear scope and do not conflict. Keep each comment independently understandable and review the accepted set before handoff.' },
    ],
    sources: [{ label: 'CRRT: agent handoff and review workflow', href: 'https://crrt.ai/docs/agent-handoff' }, { label: 'CRRT: install the visual feedback widget', href: 'https://crrt.ai/docs/install' }],
    related: ['ui-review-checklist-ai-generated-apps', 'document-components-for-coding-agents'],
  },
  {
    slug: 'ui-review-checklist-ai-generated-apps', track: 'agentic-workflows',
    title: 'A UI review checklist for AI-generated apps',
    seoTitle: 'UI review checklist for AI-generated apps',
    description: 'Review an AI-generated app before shipping: check the core journey, responsive layouts, component states, accessibility, and the final fix. Includes a checklist.',
    answer: 'Review an AI-generated app by completing one real user journey, then checking its narrow layout, empty and error states, keyboard access, and design-system consistency. Record each issue with its context, prioritize blockers, and verify accepted fixes in the running product before merging.',
    takeaway: 'A practical review checklist for your next release.',
    sections: [
      { id: 'walk-the-journey', title: '1. Complete the job the screen promises', paragraphs: [
        'Choose the task your user came to complete: create a project, invite a teammate, or update billing details. Start from the actual entry point rather than opening a polished middle screen. Use realistic content and complete the flow through its success state.',
        'Write down where you hesitated, where the next step was unclear, and where the app failed to preserve your input. A convincing first screen can hide a dead-end button, a missing permission state, or a confirmation that never reflects saved data.',
      ], items: ['Confirm the primary action has a working destination.', 'Check validation and whether input survives a correctable error.', 'Complete the success path and verify the result persists where expected.', 'Use browser back and reload to expose hidden navigation assumptions.'] },
      { id: 'stress-the-layout', title: '2. Use content that stretches the layout', paragraphs: [
        'Test a narrow phone viewport and a wide desktop viewport. Use a long project name, an empty list, several rows, and a realistic error message. Check intermediate widths if the layout changes significantly between phone and desktop.',
        'Look for clipped actions, accidental horizontal scrolling, text placed over other text, and controls that require precision tapping. Set the browser zoom to 200% and confirm the main task remains usable. A screenshot at one resolution cannot establish responsive quality.',
      ] },
      { id: 'check-interaction', title: '3. Review interaction and accessibility', paragraphs: [
        'Navigate the task using the keyboard. Focus should be visible and follow a useful order. Open and close dialogs, reach their actions, and confirm focus returns to a sensible place. Controls need accessible names, and fields need labels that remain available after typing.',
        'Use WCAG as a reference rather than treating a short checklist as certification. For example, normal text generally needs a contrast ratio of at least 4.5:1, while qualifying large text has a 3:1 threshold. Automated checks help find some failures; they do not replace manual review of the task.',
      ], items: ['Check loading, disabled, error, empty, and success states.', 'Verify important status changes are communicated beyond color alone.', 'Check text contrast and visible focus against their actual backgrounds.', 'Use reduced-motion settings and confirm content remains available.'] },
      { id: 'prioritize-and-verify', title: '4. Fix blockers, then review the correction', paragraphs: [
        'Classify each issue by its effect: blocks the task, creates a likely mistake, or affects polish. Fix blockers before low-impact visual differences. Use one comment per issue, with the route, state, viewport, and a clear expected result.',
        'When reviewing an agent’s fix, repeat the original steps and inspect the changed files. If a shared field component changed, check another consumer as well. Record what was checked and anything still unverified. CRRT can connect accepted visual feedback to the implementation handoff; your team retains the decision to ship.',
      ], code: 'Release review\n[ ] Core task completes from entry to saved result\n[ ] Narrow and wide layouts keep actions reachable\n[ ] Empty, loading, error, and success states are understandable\n[ ] Keyboard focus and labels support the task\n[ ] Contrast and reduced-motion behavior checked\n[ ] Accepted fixes rechecked in their original context\n[ ] Remaining issues and review owner recorded' },
    ],
    questions: [
      { question: 'Is this checklist enough to certify accessibility?', answer: 'No. It is a focused product review. Formal conformance requires evaluating the relevant WCAG success criteria across the applicable content and interactions.' },
      { question: 'Should the same agent implement and approve a fix?', answer: 'An agent can implement changes and run checks. Keep a person responsible for reviewing the visible result and authorizing the merge.' },
    ],
    sources: [{ label: 'W3C: WCAG 2.2 quick reference', href: 'https://www.w3.org/WAI/WCAG22/quickref/' }, { label: 'W3C: understanding minimum text contrast', href: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html' }, { label: 'CRRT: scoped agent handoffs', href: 'https://crrt.ai/docs/agent-handoff' }],
    related: ['visual-feedback-for-coding-agents', 'design-tokens-for-ai-prototypes'],
  },
  {
    slug: 'lovable-prototype-review-workflow', track: 'ai-prototyping',
    title: 'How to prototype with Lovable and review the result',
    seoTitle: 'Prototyping with Lovable: a practical workflow',
    description: 'Build one useful flow in Lovable with a focused brief, realistic states, and a repeatable review process. Includes a starter prompt and refinement checklist.',
    answer: 'To prototype with Lovable, define one user and one task, provide an approved visual reference, and build a small working flow. Review the preview with realistic content and failure states, make focused corrections, and verify the result before connecting it to real users or data.',
    takeaway: 'A focused prototype brief and a repeatable refinement loop.',
    sections: [
      { id: 'write-the-brief', title: '1. Define the smallest useful flow', paragraphs: [
        'Pick a decision you want the prototype to help you make. For example: can a first-time project owner invite a teammate without help? Define the entry screen, the action, and the observable outcome. Avoid requesting an entire application when one flow can answer the question.',
        'Include a target user, sample content, the screens needed for that task, and an existing visual reference. State which parts are simulated. A prototype with local sample data can test comprehension, but it cannot prove that authentication, authorization, or production persistence works.',
      ], code: 'Build a prototype for a founder inviting a teammate to a project.\nFlow: project overview → invite form → invitation confirmation.\nUse fictional names and email addresses; simulate sending.\nFollow the attached reference and the project’s existing tokens.\nInclude empty, invalid-email, submitting, and success states.\nKeep the scope to this flow. Do not add billing or onboarding.\nAsk about any unresolved behavior before implementing it.' },
      { id: 'build-one-step', title: '2. Build and inspect one step at a time', paragraphs: [
        'Lovable’s prompting guidance recommends planning the work and building with focused instructions. Start with the overview and invitation form. Check the hierarchy and interaction before adding the confirmation state or surrounding navigation.',
        'Use actual product language in labels, descriptions, and errors. “Invite teammate” gives you more to evaluate than placeholder copy. When the result looks promising, save a known-good point before asking for a substantial revision so you can compare or recover the earlier approach.',
      ] },
      { id: 'make-targeted-edits', title: '3. Refine the preview with precise feedback', paragraphs: [
        'Lovable provides tools for selecting and describing changes in the preview. Use these for an isolated visual correction. For a behavioral issue, reproduce the state and describe the intended result, including which existing behavior should remain.',
        'Keep feedback local: “On the invitation form, keep the entered email when validation fails and place the error below the field.” Review that correction before asking for unrelated layout changes. Several competing changes in one prompt make it harder to tell what improved.',
        'If you later work from a connected code repository with a coding agent, CRRT can capture and hand off accepted visual feedback from a supported web surface. Verify your installation and workflow first; this guide does not assume a native CRRT integration inside Lovable’s editor.',
      ] },
      { id: 'review-before-sharing', title: '4. Check what the prototype actually demonstrates', paragraphs: [
        'Ask someone to complete the task without narration. Observe whether they understand the action and recognize the result. A small usability check can expose unclear copy and missing steps, while still leaving production readiness unresolved.',
        'Before sharing outside your team, remove private content and clearly identify simulated operations. If you turn the prototype into a real application, separately review data access, server-side permissions, authentication, error handling, and deployment behavior. A successful prototype is evidence about the question you tested.',
      ], items: ['Complete the flow with realistic and invalid inputs.', 'Check narrow layouts and keyboard access.', 'Verify loading and success messages match what actually happened.', 'List simulated behavior and unresolved questions before deciding the next build.'] },
    ],
    questions: [
      { question: 'Should I build every screen before asking for feedback?', answer: 'Build enough of one flow for someone to complete a meaningful task. Review that flow before expanding into unrelated screens.' },
      { question: 'Does a working preview mean the app is ready for production?', answer: 'No. A preview can demonstrate an interaction while relying on simulated behavior. Production use needs separate functional, security, data, and operational checks.' },
    ],
    sources: [{ label: 'Lovable: prompting best practices', href: 'https://docs.lovable.dev/prompting/prompting-one' }, { label: 'Lovable: edit from the preview', href: 'https://docs.lovable.dev/features/preview-toolbar' }],
    related: ['v0-prototyping-with-your-design-system', 'ui-review-checklist-ai-generated-apps'],
  },
  {
    slug: 'v0-prototyping-with-your-design-system', track: 'ai-prototyping',
    title: 'How to prototype in v0 with your design system',
    seoTitle: 'Prototyping in v0 with your design system',
    description: 'Keep a v0 prototype aligned with your product using component references, design tokens, a focused prompt, and a human review. Includes a copyable starter brief.',
    answer: 'To keep a v0 prototype on brand, supply the existing components, tokens, and setup instructions before generating a screen. Define one flow and its states, ask v0 to reuse the approved system, then compare the preview and generated code with a known-good reference.',
    takeaway: 'A reusable v0 brief that keeps your existing system in view.',
    sections: [
      { id: 'gather-context', title: '1. Gather the system the prototype should use', paragraphs: [
        'Collect the component source or documentation, semantic tokens, an approved screen, and any required providers or global styles. Confirm that the project can actually access these materials. A reference to a private repository is only useful when the tool has permission to read it.',
        'Choose a few relevant components rather than supplying an unfiltered design archive. For a project creation flow, prioritize the form field, button, dialog, and notification patterns. Include examples that compile and describe what should happen in loading and error states.',
      ] },
      { id: 'supply-the-system', title: '2. Make reuse an explicit requirement', paragraphs: [
        'v0 documents design-system workflows for supplying your team’s components, tokens, and conventions. If that workflow is available in your account, follow its current setup instructions and review the generated starter. You can also make a small task clearer by including concrete component references and usage rules in the brief.',
        'Tell the builder what to do when a needed component is missing. Asking for a short explanation before adding a variant is easier to review than discovering a second button system after the screen is complete. Keep credentials and private customer data out of the prompt.',
      ], code: 'Prototype a “Create project” flow using our existing design system.\nRead the supplied component docs and token file first.\nReuse Button, TextField, Dialog, and the existing notice pattern.\nFollow the approved settings screen for spacing and hierarchy.\nInclude empty, submitting, validation-error, and success states.\nUse fictional content and describe any simulated behavior.\nIf a component or token is missing, explain the gap before adding it.\nReport reused components and how you checked the final flow.' },
      { id: 'refine-the-screen', title: '3. Correct the specific mismatch', paragraphs: [
        'Compare the preview with your reference at the same width. Check visual hierarchy, component choices, spacing roles, and the prominence of the main action. v0’s design mode supports selecting elements in the preview for refinement; check its documentation for current availability and limits.',
        'Ask for one correction with a clear boundary. For example: “Use the existing secondary button for Cancel and preserve the dialog’s keyboard behavior.” Avoid a request to make everything “more premium,” which gives no shared standard for the next review.',
      ] },
      { id: 'review-the-implementation', title: '4. Inspect reuse before calling the flow done', paragraphs: [
        'Review the generated code as well as the preview. A button may resemble your system while being a separate local implementation. Check import paths, supported props, new raw values, and any changes to shared components. Confirm that providers and global styles match the actual application setup.',
        'Repeat the task with a long name, an invalid submission, and a narrow viewport. When moving work into the product repository, review the actual change and run the relevant checks there. CRRT can help preserve accepted visual corrections for a coding-agent handoff on supported project surfaces. Keep a person responsible for the final merge.',
      ], items: ['Confirm shared components are imported rather than recreated.', 'Review any new tokens or variants against the existing system.', 'Test keyboard access and failure recovery in the complete flow.', 'Document simulated operations before presenting the prototype to others.'] },
    ],
    questions: [
      { question: 'Can a screenshot replace component source and usage rules?', answer: 'A screenshot helps communicate appearance. It does not describe supported props, behavior, token names, or setup requirements. Include those when reuse matters.' },
      { question: 'Should I update the design system to match every generated screen?', answer: 'Review the difference first. Reuse the existing system when it covers the need, and add a new pattern only when there is a clear product reason.' },
    ],
    sources: [{ label: 'v0: design systems', href: 'https://v0.app/docs/design-systems-2' }, { label: 'v0: design mode', href: 'https://v0.app/docs/design-mode' }, { label: 'v0: overview and capabilities', href: 'https://v0.app/docs' }],
    related: ['design-tokens-for-ai-prototypes', 'lovable-prototype-review-workflow'],
  },
  ...additionalResources,
]
