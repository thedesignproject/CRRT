import type { Resource } from './model.ts'

export const additionalResources: Resource[] = [
  {
    slug: 'report-responsive-ui-issues', track: 'agentic-workflows',
    title: 'How to report responsive UI issues precisely',
    seoTitle: 'How to report responsive UI issues precisely',
    description: 'Describe responsive UI problems with exact widths, realistic content, reproduction steps, and acceptance checks. Includes a copyable feedback example.',
    answer: 'A useful responsive issue report names the route, viewport width in CSS pixels, content, and interaction that expose the problem. Explain the expected behavior at that width, then verify the fix at nearby widths and with the same content.',
    takeaway: 'A responsive issue report someone else can reproduce.',
    sections: [
      { id: 'reproduce-the-break', title: '1. Find the width where the problem starts', paragraphs: [
        'Open the actual flow and slowly narrow the browser. Record the first width where an action disappears, a label overlaps, or a panel creates unwanted horizontal scrolling. “Broken on mobile” could describe several different layouts and gives an implementer little to reproduce.',
        'Record the viewport in CSS pixels rather than the screenshot’s exported pixel dimensions. Include browser zoom and any important browser details. If you found the issue on a physical device, include its orientation and test the same task there again after a fix. Device names alone do not identify the available layout space.',
      ] },
      { id: 'preserve-the-content', title: '2. Include the content and state', paragraphs: [
        'Use the same long name, validation message, or populated table that exposed the issue. A screenshot of an empty screen may hide the condition that broke the original layout. Replace private information with fictional content of a similar length before sharing it.',
        'Describe the interaction as well as the final picture. A navigation drawer might cover the action only after opening a submenu. A form might work until an error appears. Record the shortest sequence that reaches the state, and distinguish a reproducible failure from an intermittent observation.',
      ], code: 'Route: /projects/new\nViewport: 390 CSS px wide, 100% browser zoom\nState: project name contains 70 characters\nSteps: enter the name, leave Owner empty, select Create\nObserved: the validation row pushes Create outside the panel\nExpected: the message wraps and Create remains reachable\nPreserve: validation rules, labels, and existing button variants\nVerify: repeat at 390px, then check 360px, 430px, and desktop' },
      { id: 'describe-intent', title: '3. Define the responsive intent', paragraphs: [
        'Say which relationship should survive as the screen gets smaller. For example, the action should remain after the field it submits, the menu should remain dismissible, and a label should stay associated with its control. These constraints are clearer than an isolated request to reduce padding.',
        'Avoid requiring every table to fit into one narrow column. Some content needs a two-dimensional presentation. Decide whether the appropriate response is wrapping, a simpler summary, a different layout, or a clearly bounded scroll region. W3C’s reflow guidance describes the accessibility requirement and its exceptions; one screenshot does not establish conformance.',
      ] },
      { id: 'verify-nearby-widths', title: '4. Check the original state and its neighbors', paragraphs: [
        'An agent can make one viewport look correct by introducing a rule that fails just above it. Repeat the original task and inspect widths on either side of the reported failure. Check a second consumer if the change touches a shared layout or control.',
        'Keep the verification note with the accepted correction. CRRT can preserve a selected element and visual feedback for a coding-agent handoff. The reviewer should still confirm the result in the running product and record any device or interaction that remains untested.',
      ], items: ['Use the same content and validation state as the report.', 'Check keyboard access and whether actions remain reachable.', 'Confirm the desktop layout still follows the approved design.', 'Separate new observations from the original issue before closing it.'] },
    ],
    questions: [
      { question: 'Is testing common phone and desktop widths enough?', answer: 'It is a useful start, but layouts can fail between preset sizes. Check near the width where the problem appears and repeat the real interaction.' },
      { question: 'Should every horizontal scrollbar be removed?', answer: 'No. Some content, including certain tables and diagrams, needs two-dimensional layout. Identify whether scrolling is necessary, bounded, and understandable.' },
    ],
    sources: [{ label: 'W3C: understanding reflow', href: 'https://www.w3.org/WAI/WCAG22/Understanding/reflow.html' }, { label: 'CRRT: visual feedback setup', href: 'https://crrt.ai/docs/install' }],
    related: ['ui-review-checklist-ai-generated-apps', 'verify-a-ui-fix'],
  },
  {
    slug: 'focused-prototype-review', track: 'ai-prototyping',
    title: 'How to run a focused 15-minute prototype review',
    seoTitle: 'A focused 15-minute prototype review',
    description: 'Run a focused prototype review around one task, one build, and clear decisions. Includes a suggested 15-minute agenda and a review-request template.',
    answer: 'A focused prototype review gives reviewers one task, a fixed build, and specific questions. Use the time to observe the flow, identify blockers, and decide the next changes. The 15-minute agenda below is a suggested format to adapt, not a promise that every review fits that time.',
    takeaway: 'A short agenda that ends with decisions and clear ownership.',
    sections: [
      { id: 'prepare-the-task', title: '1. Prepare one task and a stable build', paragraphs: [
        'Choose the decision this review should inform. “Can a first-time owner invite a teammate?” is focused enough to explore. “What do you think of the app?” invites a broad inventory of preferences that may be hard to act on in one session.',
        'Share a build link, fictional sample data, and the starting state. Record a build identifier or commit when available. Avoid changing the prototype during the session: comments on two different versions can sound contradictory even when both observations are accurate. Note simulated behavior before anyone starts.',
      ], code: 'Review goal: can a first-time owner invite a teammate?\nBuild: [review URL and version]\nStart: project overview with no teammates\nTask: invite a teammate and explain how you know it worked\nQuestions: is the action clear; can an invalid email be corrected?\nSimulated: the prototype does not send real invitations\nOutput: agreed blockers, owner, and next review point' },
      { id: 'use-a-short-agenda', title: '2. Use the time to observe and decide', paragraphs: [
        'As a starting agenda, spend two minutes aligning on the task and prototype limits, seven minutes observing the flow, four minutes grouping issues, and two minutes agreeing on next steps. Adjust the allocation to the task; a complex workflow may need a longer session.',
        'Let the reviewer attempt the task before explaining the interface. Record where they hesitate and what they expected to happen. If the facilitator supplies every next step, the session mostly tests the facilitator’s explanation. Ask neutral follow-up questions that help distinguish a confusing label from a missing capability.',
      ], items: ['Minutes 0–2: confirm the task, audience, and prototype boundaries.', 'Minutes 2–9: attempt the flow and capture observations.', 'Minutes 9–13: distinguish blockers, questions, and lower-impact polish.', 'Minutes 13–15: assign decisions, owners, and a follow-up build.'] },
      { id: 'separate-evidence', title: '3. Separate observations from proposed solutions', paragraphs: [
        'Capture what happened before debating the fix. “The reviewer selected Cancel while trying to continue” preserves evidence. “Make the button blue” is one possible response. The decision may instead involve wording, order, hierarchy, or a missing explanation.',
        'Keep unresolved product questions visible. A prototype review can reveal a confusing permission model, but it cannot settle the business rule by changing the screen alone. Assign someone to resolve that rule before asking a builder or coding agent to implement a visual workaround.',
      ] },
      { id: 'close-with-next-steps', title: '4. End with a small accepted change set', paragraphs: [
        'Choose the changes that matter for the next build and assign a review owner. Include the affected screen, the intended outcome, and an observable check. Park unrelated ideas in a separate list so the accepted work retains a clear scope.',
        'If you use CRRT, review the collected visual comments and hand the accepted corrections to your coding agent. After implementation, repeat the original task on the new build. A useful follow-up states what changed, what was checked, and which question the team will review next.',
      ] },
    ],
    questions: [
      { question: 'Can this agenda replace user research?', answer: 'No. It structures a focused prototype review. It does not establish that the reviewers represent your users or that the findings generalize to a wider population.' },
      { question: 'What if the review uncovers more work than the time allows?', answer: 'Record the remaining observations and choose a narrower next decision. Extend or schedule another session when the flow needs deeper investigation.' },
    ],
    sources: [{ label: 'Lovable: refining a running preview', href: 'https://docs.lovable.dev/features/preview-toolbar' }, { label: 'CRRT: accepted-feedback handoff', href: 'https://crrt.ai/docs/agent-handoff' }],
    related: ['client-prototype-review', 'review-ai-generated-forms'],
  },
  {
    slug: 'compare-design-to-browser', track: 'design-systems',
    title: 'How to compare a design frame with a browser screenshot',
    seoTitle: 'Compare a design with a browser screenshot',
    description: 'Compare a design and its implementation under matching conditions. Check viewport, fonts, content, layout, and states before requesting a visual correction.',
    answer: 'Compare a design frame and browser screenshot after matching their viewport, content, fonts, theme, and state. Review hierarchy and layout relationships before small pixel differences. Use an overlay as evidence of a mismatch, then verify the intended behavior in the running product.',
    takeaway: 'A comparison protocol that separates real drift from setup differences.',
    sections: [
      { id: 'match-the-conditions', title: '1. Match the conditions before comparing', paragraphs: [
        'Choose the frame that represents the implemented screen and set the browser to the same CSS viewport width. Record browser zoom, device pixel ratio when relevant, theme, and data state. Exported screenshot pixels may differ from CSS pixels, so establish the relationship before interpreting an overlay.',
        'Use equivalent content. A short placeholder name in the design and a long customer name in the browser can create different wrapping without a spacing defect. Check that the intended font has loaded and that the two views show the same selected, expanded, or validation state.',
      ] },
      { id: 'compare-the-structure', title: '2. Check the structure before the decoration', paragraphs: [
        'Start with the screen’s purpose, primary action, information order, and alignment. Then compare component choice, text hierarchy, spacing roles, image crop, and surface treatment. A slightly different border is less important than an action appearing beside the wrong decision.',
        'Write down the rule behind each difference. For example, a panel might need to align with the content grid, or the gap between a label and its field might need to use the shared form spacing. This makes the correction reusable instead of turning the screen into a collection of isolated coordinates.',
      ], code: 'Comparison record\nDesign: [frame and version]\nBuild: [URL and version]\nConditions: [viewport, zoom, theme, content, state]\nMismatch: [specific element and observed difference]\nIntended rule: [alignment, component, token, or behavior]\nScope: [affected instance or shared implementation]\nVerification: [original comparison plus a nearby responsive state]' },
      { id: 'use-overlays-carefully', title: '3. Use overlays to locate differences', paragraphs: [
        'An overlay can make a shifted edge, changed crop, or inconsistent panel width easier to see. Keep the captures aligned at the same scale, then vary opacity or compare them side by side. If the whole screen drifts at once, revisit the capture conditions before filing dozens of comments.',
        'Pixel differences are not automatically product defects. Font rendering, platform differences, and dynamic content can change screenshot output. Playwright’s visual comparison documentation describes environment-related variation and baseline handling. Keep a human decision about whether a visible difference violates the approved intent.',
      ] },
      { id: 'verify-the-live-result', title: '4. Verify the correction in the live flow', paragraphs: [
        'A screenshot shows one state. Open the implementation and check focus, hover, validation, scrolling, and the next screen where relevant. A change that improves a static comparison may still clip longer content or make a control harder to use.',
        'Send a focused correction with its reference frame, current screenshot, and acceptance check. CRRT can attach the visual observation to the relevant element on a supported web surface. Review the resulting implementation at the original width and a narrower width before treating the mismatch as resolved.',
      ], items: ['Confirm that the reference is current and approved.', 'Separate intentional browser adaptations from unintended drift.', 'Reuse the existing component or token when it expresses the rule.', 'Record what the screenshot comparison did not test.'] },
    ],
    questions: [
      { question: 'Should a browser screenshot match a design pixel for pixel?', answer: 'That depends on the agreed acceptance criteria and environment. Review whether the implementation preserves the intended layout, hierarchy, and behavior; explain any tolerance for rendering differences.' },
      { question: 'Can a matching screenshot prove the flow works?', answer: 'No. It cannot establish keyboard behavior, validation, persistence, navigation, or states outside the captured image. Test those in the running product.' },
    ],
    sources: [{ label: 'Playwright: visual comparisons and environment differences', href: 'https://playwright.dev/docs/test-snapshots' }, { label: 'W3C: responsive reflow requirements', href: 'https://www.w3.org/WAI/WCAG22/Understanding/reflow.html' }],
    related: ['report-responsive-ui-issues', 'visual-feedback-vs-visual-regression'],
  },
  {
    slug: 'review-light-and-dark-themes', track: 'design-systems',
    title: 'How to review light and dark color themes together',
    seoTitle: 'Review light and dark UI themes together',
    description: 'Review light and dark themes using the same screens, states, and content. Includes a theme-review matrix, text contrast checks, and correction examples.',
    answer: 'Review light and dark themes as two versions of the same task. Compare matching screens and states, measure relevant text/background pairs, and check that semantic roles survive the theme change. A readable default screen does not establish that hover, focus, error, and disabled states are correct.',
    takeaway: 'A paired-theme review matrix with explicit checks.',
    sections: [
      { id: 'pair-the-screens', title: '1. Pair matching screens and states', paragraphs: [
        'Start with one real flow and use the same content in both themes. Include an empty state, a populated state, a validation error, and an open overlay where those exist. Record the build and theme preference so another reviewer can reproduce the comparison.',
        'Review each theme in the running product rather than judging a palette sheet alone. A surface color can work in isolation while making a field, border, or secondary action difficult to distinguish in context. Keep browser settings and viewport consistent while comparing the pair.',
      ] },
      { id: 'measure-relevant-pairs', title: '2. Measure the pairs people must read', paragraphs: [
        'Identify the actual foreground and background for body text, supporting text, field labels, errors, and buttons. Check the pair in the state being reviewed. An overlay, transparency, or image can change the effective background, so a simple opaque-color calculation may not describe the rendered result.',
        'Use the text contrast checker linked below for opaque sRGB HEX pairs. It reports the selected text criterion; it does not evaluate the entire component or certify a page. Review non-text indicators and interactions separately using the relevant accessibility requirements.',
      ], items: ['Check normal text against the applicable minimum text contrast requirement.', 'Confirm the text category before applying a large-text exception.', 'Review supporting text and placeholders in each theme.', 'Check errors and selected states without relying only on color.'] },
      { id: 'review-semantic-meaning', title: '3. Preserve meaning across the theme switch', paragraphs: [
        'An action should retain its role even if its color changes. Check that destructive actions, quiet actions, selected navigation, and status messages remain distinguishable for the same reason in both themes. Avoid treating a light palette as a set of values to invert mechanically.',
        'Inspect the tokens behind an inconsistent element before asking for a new color. The component may use a raw value or a token that describes the wrong role. A correction such as “Use the secondary-text token for this explanation in both themes” gives an implementer a clearer rule than “make the gray lighter.”',
      ], code: 'Theme review matrix\nScreen / state: account form with invalid email\nLight: label, input, error text, border, primary action\nDark: label, input, error text, border, primary action\nCheck: text pairs, visible focus, error meaning, overlay layering\nIssue: helper text uses a fixed color instead of its semantic token\nRequested fix: reuse the helper-text token in both themes\nVerify: repeat the state, switch themes, and reload the saved preference' },
      { id: 'review-the-switch', title: '4. Test switching, persistence, and the fix', paragraphs: [
        'If the product offers a theme preference, switch while a dialog is open and while a field has an error. Reload the page to inspect persistence. Check the preference rules your product actually supports rather than assuming that a system setting and an application setting are interchangeable.',
        'Record the specific theme and state with every visual correction. When a shared token changes, inspect another consumer in both themes. A coding agent can implement an accepted request, but a reviewer should confirm the resulting pair before approving the change.',
      ] },
    ],
    questions: [
      { question: 'Does passing a contrast check mean the theme is accessible?', answer: 'No. A text contrast result addresses one color pair and criterion. Keyboard access, focus, state communication, reflow, and other applicable requirements still need review.' },
      { question: 'Should every light-theme color have a direct dark-theme equivalent?', answer: 'Every semantic role needs an appropriate treatment, but its implementation can differ. Review the role and task instead of requiring a mechanical inversion of each value.' },
    ],
    sources: [{ label: 'W3C: minimum text contrast', href: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html' }, { label: 'W3C: use of color', href: 'https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html' }],
    related: ['text-contrast-checker', 'storybook-design-review'],
  },
  {
    slug: 'minimum-viable-design-system', track: 'design-systems',
    title: 'What belongs in a minimum viable design system?',
    seoTitle: 'Minimum viable design system: what to include',
    description: 'Start a useful design system with shared decisions, a few real components, meaningful states, and ownership. Includes a practical first-release checklist.',
    answer: 'A minimum viable design system contains the shared values and components needed for a real product flow, plus usage rules and a way to maintain them. Start with an approved screen, semantic tokens, frequently used controls, state examples, and an owner for changes.',
    takeaway: 'A small system you can apply and review in a real flow.',
    sections: [
      { id: 'choose-a-real-flow', title: '1. Choose a real flow as the boundary', paragraphs: [
        'Select a flow the team is actively building or refining. A project creation flow might need headings, fields, buttons, a dialog, and a notice. It probably does not need every chart, navigation pattern, and commerce component the product could eventually contain.',
        'List the decisions that repeat across that flow. Use the approved implementation and design reference to distinguish a shared decision from a one-off arrangement. The word “minimum” describes a useful boundary; it does not justify leaving behavior or accessibility undefined.',
      ] },
      { id: 'capture-shared-decisions', title: '2. Capture values and components together', paragraphs: [
        'Name the recurring color, spacing, typography, and radius decisions by purpose where practical. Then connect those tokens to the controls people actually use. A token inventory without consumers does not tell a builder which component belongs on the next screen.',
        'Record the component’s location, supported variants, and an example that works. Explain when to use an alternative, such as a link for navigation instead of an action button. Keep documentation close to the implementation or link it clearly from the project entry point.',
      ], code: 'First system release\nReference: one approved product flow and its design frame\nTokens: surfaces, text, actions, borders, spacing, type, radii\nComponents: the fields, actions, and notices used by that flow\nStates: default, focus, disabled, loading, error, success\nUsage: location, supported variants, example, alternatives\nOwnership: who approves changes and resolves exceptions\nVerification: one second screen built with the same system' },
      { id: 'include-real-states', title: '3. Document the states that change the task', paragraphs: [
        'Build examples with realistic content and failure conditions. A field needs more than its empty default appearance. Show what happens when input is invalid, when a request is pending, and when a label or value is longer than expected.',
        'Use Storybook if it is already part of the project, or another runnable example that reviewers can reach. The goal is a reliable way to inspect the component’s behavior and appearance. Adding a documentation platform is a separate decision from making the first component understandable.',
      ], items: ['Show a keyboard focus state and check the accessible name.', 'Explain whether a pending action can be activated again.', 'Include long content and a narrow layout.', 'Review both themes when the product supports them.'] },
      { id: 'prove-reuse', title: '4. Prove reuse and establish ownership', paragraphs: [
        'Apply the system to a second screen. Ask a teammate or coding agent to locate the documented components and build a small change with them. Review whether the result uses supported variants and existing tokens instead of creating similar local alternatives.',
        'Assign someone to approve new patterns and retire duplicates. Keep an exception record when a real need is not covered, with a reason and a review point. Repeated visual feedback can reveal where the system needs a better rule; one unusual screen does not automatically require a new global component.',
      ] },
    ],
    questions: [
      { question: 'How many components should the first release contain?', answer: 'Use the components needed for the selected flow and a meaningful reuse test. A fixed component count would ignore the product and the work the team needs to complete.' },
      { question: 'Can a coding agent create the system for me?', answer: 'An agent can help inventory values, draft examples, and apply approved patterns. A person still needs to resolve design decisions and review the resulting behavior.' },
    ],
    sources: [{ label: 'Design Tokens Community Group: shared design decisions', href: 'https://www.designtokens.org/' }, { label: 'Storybook: documenting components', href: 'https://storybook.js.org/docs/writing-docs/index' }],
    related: ['design-tokens-for-ai-prototypes', 'document-components-for-coding-agents'],
  },
  {
    slug: 'design-decisions-for-coding-agents', track: 'agentic-workflows',
    title: 'How to record design decisions so coding agents preserve intent',
    seoTitle: 'Record design decisions for coding agents',
    description: 'Give coding agents durable design context with a concise decision record: the choice, reason, scope, source, and review conditions. Includes a template.',
    answer: 'Record a design decision as a specific choice with a reason, scope, source, and conditions for revisiting it. Link that record from the project’s agent instructions and the affected component documentation so an agent can find the rule before changing the interface.',
    takeaway: 'A decision record that explains the reason behind a design rule.',
    sections: [
      { id: 'identify-the-decision', title: '1. Record a choice someone is likely to undo', paragraphs: [
        'Start with decisions that are easy to mistake for accidents: a deliberately quiet secondary action, a compact table, a persistent notice, or an exception to the usual component layout. A record is most valuable when the next implementer could plausibly “improve” the screen by removing its intent.',
        'Separate an approved decision from a suggestion or an unresolved question. State who owns the decision and link to the supporting discussion, prototype review, or product requirement when that evidence is available. Do not turn a draft comment into an authoritative rule by placing it in an agent file.',
      ] },
      { id: 'write-the-record', title: '2. Capture the choice, reason, and boundary', paragraphs: [
        'Write the decision in concrete terms and explain the task it supports. “Keep the project picker above the table so people can confirm their context before editing” is more durable than “use this layout because it looks cleaner.” The reason gives an agent something to preserve when the implementation changes.',
        'Bound the rule. Identify the component, screen, or workflow it governs and any exceptions. Include a review condition, such as a change to the permission model or evidence that users cannot find the action. A documented decision should remain revisable when its assumptions change.',
      ], code: 'Decision: keep the project picker visible above the editable table\nStatus: approved\nReason: editing must happen in an explicit project context\nApplies to: project-scoped table screens\nPreserve: context remains visible before the first editable row\nExceptions: read-only summaries outside a project workspace\nSource: [review or requirement link]\nOwner: [decision owner]\nRevisit when: workspace navigation or project permissions change' },
      { id: 'make-it-discoverable', title: '3. Put the record on the implementation path', paragraphs: [
        'Store the record where the team keeps product and design context, then link it from the repository’s entry instructions and the affected component brief. Prefer a stable source over copying the same paragraph into several files that can diverge.',
        'Ask the coding agent to identify applicable decisions before proposing a change. It should be able to point to the source and describe how the requested correction respects the boundary. If two records conflict, resolve the conflict before implementation rather than asking the agent to guess which owner intended the current behavior.',
      ] },
      { id: 'maintain-the-record', title: '4. Review changes against the original intent', paragraphs: [
        'During review, check the outcome the decision protects. The project picker example needs a task-level check that editing still occurs in a visible project context. Matching the old pixels would not be enough if navigation changes how the screen is reached.',
        'When the decision changes, update its status and source instead of silently erasing the previous reason. Record any migration or affected consumers. Accepted visual feedback can then refer to the new rule, and the reviewer can confirm both the local correction and the broader intent before approving the result.',
      ], items: ['Identify stale assumptions during the review.', 'Distinguish a one-off exception from a new default.', 'Link the decision from the next agent task when relevant.', 'Keep unresolved questions separate from approved instructions.'] },
    ],
    questions: [
      { question: 'Should every small style choice have a decision record?', answer: 'No. Use records for choices with meaningful consequences or a high chance of being misinterpreted. Routine token and component usage belongs in the system documentation.' },
      { question: 'Does a decision record prevent an agent from making a mistake?', answer: 'No. It provides discoverable context. The task still needs clear boundaries, implementation checks, and human review of the result.' },
    ],
    sources: [{ label: 'Storybook: examples that explain component usage', href: 'https://storybook.js.org/docs/ai/best-practices' }, { label: 'CRRT: handoff context and review boundaries', href: 'https://crrt.ai/docs/agent-handoff' }],
    related: ['scope-a-visual-fix', 'document-components-for-coding-agents'],
  },
  {
    slug: 'scope-a-visual-fix', track: 'agentic-workflows',
    title: 'How to scope one visual fix for a coding agent',
    seoTitle: 'Scope a visual fix for a coding agent',
    description: 'Turn accepted UI feedback into one bounded implementation task. Define the target, approved outcome, constraints, affected consumers, and review evidence.',
    answer: 'Scope one visual fix by naming the accepted outcome, affected element, implementation boundaries, and checks that will establish success. Give the agent access to the relevant project context, then require it to report what changed and what remains unverified.',
    takeaway: 'A bounded implementation brief with a clear review point.',
    sections: [
      { id: 'confirm-the-outcome', title: '1. Confirm that the requested outcome is approved', paragraphs: [
        'Read the visual comment and separate its observation from its proposed solution. Confirm which outcome the reviewer actually accepted. A comment asking whether the button should move is still a question until someone owns the decision.',
        'Identify the target route, element, viewport, and state. Link the screenshot or design reference when available. If important context is missing, resolve that ambiguity before an agent starts editing. A precise implementation brief cannot compensate for an undecided product requirement.',
      ] },
      { id: 'define-the-boundary', title: '2. Define the smallest useful boundary', paragraphs: [
        'Describe the behavior and content that must remain intact. A spacing correction on an invitation form should not silently alter the permission model, redesign navigation, or rewrite unrelated copy. Point to the existing component and tokens when those already express the desired rule.',
        'Ask the agent to inspect the implementation before deciding whether the issue is local or shared. A local override might be the cause, but the same symptom can originate in a shared component. If the appropriate fix expands the scope, have the agent explain the affected consumers before proceeding with a wider change.',
      ], code: 'Accepted outcome: the invitation error stays beside its field\nTarget: /settings/team, invite form, invalid-email state\nReference: [selected element, screenshot, and approved example]\nReuse: existing form field and error-message pattern\nPreserve: validation, submission, labels, and permission checks\nBoundary: fix this issue; report shared consumers before widening scope\nVerify: invalid email, correction, successful submission, narrow width\nReturn: changed files, checks performed, and any unverified behavior' },
      { id: 'supply-safe-context', title: '3. Supply the context needed to implement', paragraphs: [
        'Include the relevant project instructions, component documentation, and approved design decisions. Give enough context to locate the source without pasting a large archive of unrelated material. Use fictional examples when private customer content is unnecessary to reproduce the problem.',
        'Use the project’s supported handoff method. CRRT’s agent documentation describes scoped access and review boundaries; follow those instructions for the actual connection. Do not place access tokens in public URLs or in a reusable task template. A guide about handoff is not a reason to broaden repository or account permissions.',
      ] },
      { id: 'review-the-evidence', title: '4. Review the result before expanding the task', paragraphs: [
        'Ask for a short description of the implementation and evidence tied to each requested check. “Tests passed” is incomplete if the request depended on a narrow layout that was never opened. Distinguish automated checks, manual inspection, and behavior that remains untested.',
        'Repeat the original state and review nearby consumers if shared code changed. Keep newly discovered issues separate unless they are necessary to complete this fix. A person should decide whether the change meets the accepted outcome and is ready to merge; an agent’s completion status does not make that decision.',
      ], items: ['Confirm the change matches the accepted request.', 'Inspect shared-component impact when applicable.', 'Record the original issue’s verification result.', 'Assign a follow-up owner for anything deliberately left unresolved.'] },
    ],
    questions: [
      { question: 'Should I prescribe the exact code change?', answer: 'Provide verified constraints and references. Let the agent inspect the source before choosing an implementation unless there is a specific, approved technical requirement.' },
      { question: 'What if the smallest correct fix affects several screens?', answer: 'Make that impact explicit, agree on the expanded boundary, and review representative consumers. A small task should still fix the actual cause.' },
    ],
    sources: [{ label: 'CRRT: scoped agent handoff', href: 'https://crrt.ai/docs/agent-handoff' }, { label: 'CRRT: UI review guidance', href: 'https://crrt.ai/skill.md' }],
    related: ['visual-feedback-brief-builder', 'verify-a-ui-fix'],
  },
  {
    slug: 'review-ai-generated-forms', track: 'ai-prototyping',
    title: 'How to find missing states in AI-generated forms',
    seoTitle: 'Review AI-generated forms for missing states',
    description: 'Review generated forms beyond the default screen. Check validation, pending requests, failures, recovery, keyboard access, and success with realistic inputs.',
    answer: 'Review an AI-generated form by submitting empty, invalid, valid, and repeated inputs, then observing pending, failure, recovery, and success states. Check that labels remain available, errors identify the problem, and a person can complete the task using the keyboard.',
    takeaway: 'A form-state matrix and a focused correction prompt.',
    sections: [
      { id: 'define-the-real-task', title: '1. Define the task and the data boundary', paragraphs: [
        'Choose a form someone actually needs to complete, such as inviting a teammate or creating a project. Identify which fields are required, what a valid result looks like, and whether the prototype is simulating a request or calling a real service.',
        'Use fictional data during review. Confirm the expected validation rules with the product owner rather than accepting whatever the generated screen happens to do. A convincing email field can still submit an empty value, discard useful input, or report success without completing the intended operation.',
      ] },
      { id: 'build-the-state-matrix', title: '2. Walk the form through meaningful states', paragraphs: [
        'Begin with an untouched form, then try an empty submission and a value that violates a known rule. Correct the input and submit again. Observe what happens while the request is pending and when the action succeeds or fails.',
        'Use a controlled fixture or the project’s testing setup to exercise a slow request and a recoverable failure. Do not manufacture a production outage to test an error message. Record the setup so another reviewer can reach the same state without guessing.',
      ], code: 'Form review matrix\nUntouched: instructions and required fields are understandable\nInvalid: the affected field and correction are clear\nPending: progress is visible and duplicate submission is handled\nFailure: entered values survive when safe; recovery is available\nSuccess: the confirmation matches the operation actually completed\nReturn visit: saved results appear where expected\nNarrow layout: errors and actions remain reachable' },
      { id: 'check-recovery', title: '3. Check recovery and keyboard use', paragraphs: [
        'Read the error as someone who does not know the implementation. It should help identify the problem and the next useful action. A generic failure message can be appropriate when details are unavailable, but it should not pretend that a specific field is wrong without evidence.',
        'Navigate the form by keyboard and confirm that labels, visible focus, and submission remain usable. Review whether important status changes are communicated to assistive technology. W3C’s form tutorials explain labeling and validation; a short state matrix does not cover every accessibility requirement.',
      ], items: ['Keep labels available after values are entered.', 'Confirm that validation does not erase correct input unnecessarily.', 'Check whether focus moves or remains in a useful place.', 'Avoid communicating an error through color alone.'] },
      { id: 'request-one-correction', title: '4. Request a bounded correction and retest', paragraphs: [
        'Capture the exact state and describe the intended behavior. For example: “After an invalid invitation, keep the entered email and show the correction next to that field. Preserve the existing validation rule.” That gives an agent a narrower task than a request to improve the entire form.',
        'After the change, repeat the invalid submission, correction, and success path. Check the narrow layout again because new error text can change the structure. If the prototype still simulates the request, state that limit when sharing the review; a polished success state does not establish that the real service works.',
      ] },
    ],
    questions: [
      { question: 'Do all forms need the same states?', answer: 'Use the states relevant to the operation. A local filter and a network-backed account form have different failure and persistence behavior, but both need clear outcomes.' },
      { question: 'Should a disabled button explain every validation rule?', answer: 'The form should make requirements and recovery understandable. Do not rely on an unreachable disabled action as the only way a person could discover what is missing.' },
    ],
    sources: [{ label: 'W3C: form validation and recovery', href: 'https://www.w3.org/WAI/tutorials/forms/validation/' }, { label: 'W3C: labeling form controls', href: 'https://www.w3.org/WAI/tutorials/forms/labels/' }],
    related: ['lovable-prototype-review-workflow', 'report-responsive-ui-issues'],
  },
  {
    slug: 'storybook-design-review', track: 'design-systems',
    title: 'How to organize a Storybook design review',
    seoTitle: 'How to organize a Storybook design review',
    description: 'Review Storybook components with a focused state matrix, realistic fixtures, theme comparisons, and links back to affected product screens.',
    answer: 'Organize a Storybook design review around the component variants and states that matter to a real product task. Use stable examples, realistic content, and matching theme conditions. Record each issue against its story and verify representative product consumers after shared changes.',
    takeaway: 'A component review plan that stays connected to the product.',
    sections: [
      { id: 'choose-the-review-set', title: '1. Choose the components and states', paragraphs: [
        'Start with the component change or product flow that needs review. Select the stories that express its common usage and meaningful edge cases. Reviewing every story in the library can obscure the decision the team actually needs to make.',
        'Record the Storybook build and story identifiers. Keep the review on a stable version, and note any provider, font, theme, or fixture setup required to interpret the example. A component rendered outside its intended application context can look wrong for a reason the component cannot fix.',
      ] },
      { id: 'use-realistic-examples', title: '2. Use examples that stress the contract', paragraphs: [
        'Include a default example, the most common alternate variant, and states that affect behavior. For a field, that might mean required, invalid, disabled, and long-content examples. For a dialog, include dismissal, keyboard focus, and content that needs more vertical space.',
        'Storybook stories capture rendered states and can expose arguments through controls. Use those capabilities to make the review repeatable. When a controls configuration reveals an important missing example, save an appropriate story through the project’s normal code review process rather than relying on a reviewer’s temporary settings.',
      ], code: 'Component review plan\nBuild: [Storybook URL and version]\nComponent: [name and source location]\nExamples: default, alternate variant, long label, error, loading\nThemes: light and dark, where supported\nInteractions: keyboard activation, focus, dismissal, recovery\nConsumers: two known product screens that use the component\nReview output: accepted corrections, questions, and affected stories' },
      { id: 'review-with-context', title: '3. Review appearance and interaction together', paragraphs: [
        'Compare token usage, spacing, text hierarchy, and theme treatment, then interact with the example. Check whether a pending action can be repeated, whether focus remains visible, and whether status information survives a theme change. A static story thumbnail cannot answer those questions.',
        'Distinguish a component defect from a usage defect. If the product passes the wrong variant or wraps the component in an unsuitable layout, a global component change may create new problems. Include the relevant story and consumer context when asking the implementer to investigate.',
      ] },
      { id: 'verify-product-consumers', title: '4. Follow shared changes back to product screens', paragraphs: [
        'After implementation, inspect the affected stories and at least representative known consumers. A corrected control can still behave differently inside a dense table, an overlay, or a narrow settings panel. Use actual product content where it is safe to do so.',
        'CRRT supports a Storybook review workflow in the current product, but setup and supported versions should follow the project’s current documentation. Keep the accepted correction, story context, and verification result together. The reviewer still owns the decision that the shared change is ready to ship.',
      ], items: ['Record the story and version for each accepted correction.', 'Check whether the requested change is local or shared.', 'Revisit both themes when a shared color role changes.', 'Record consumer checks instead of assuming isolation proves integration.'] },
    ],
    questions: [
      { question: 'Can Storybook replace reviewing the product?', answer: 'No. It provides focused component examples. Product layouts, data, routing, permissions, and surrounding interactions still need integration review.' },
      { question: 'Should every variant get its own story?', answer: 'Create examples for meaningful usage and behavior that reviewers need to inspect. Avoid a combinatorial inventory that adds little evidence about real use.' },
    ],
    sources: [{ label: 'Storybook: writing stories and using controls', href: 'https://storybook.js.org/docs/writing-stories' }, { label: 'CRRT: component review entry points', href: 'https://crrt.ai/#install' }],
    related: ['review-light-and-dark-themes', 'document-components-for-coding-agents'],
  },
  {
    slug: 'verify-a-ui-fix', track: 'agentic-workflows',
    title: 'How to verify a UI fix before marking feedback resolved',
    seoTitle: 'Verify a UI fix before resolving feedback',
    description: 'Verify a visual correction against the original state, expected outcome, nearby layouts, and shared consumers. Includes a copyable resolution record.',
    answer: 'Verify a UI fix by repeating the original reproduction steps on the changed build, checking the accepted outcome, and inspecting relevant nearby states or shared consumers. Record the build, checks performed, and anything unverified before marking the feedback resolved.',
    takeaway: 'A resolution record that connects the change to its evidence.',
    sections: [
      { id: 'return-to-the-request', title: '1. Return to the accepted request', paragraphs: [
        'Read the original observation and expected outcome before inspecting the implementation. Confirm that the feedback still describes the current product. A code change can be correct in isolation while addressing a different interpretation of the request.',
        'Find the original route, viewport, content, and interaction state. Use a specific build link or version so the reviewer and implementer are checking the same result. If the issue cannot be reproduced from the available context, record that limitation rather than treating an unrelated screenshot as proof.',
      ] },
      { id: 'repeat-the-task', title: '2. Repeat the task on the changed build', paragraphs: [
        'Follow the original reproduction steps, then complete the next meaningful action. If the issue concerned a validation message, submit the invalid value, correct it, and confirm the successful path. If it concerned a menu, open, use, and dismiss the menu in the relevant layout.',
        'Compare the result with the approved outcome. A screenshot can support a visual check, but the behavior often needs direct interaction. Label evidence accurately: a unit test, a screenshot comparison, and a manual task review establish different things.',
      ], code: 'UI fix verification\nRequest: [accepted feedback link]\nBuild: [URL and version]\nOriginal state: [route, viewport, content, interaction]\nExpected: [observable outcome]\nChecked: [reproduction steps and resulting behavior]\nNearby checks: [responsive state or shared consumers]\nEvidence: [screenshots, test output, or review notes]\nUnverified: [remaining limits]\nDecision: [resolved, needs correction, or needs a product decision]' },
      { id: 'check-the-impact', title: '3. Inspect the meaningful impact around the fix', paragraphs: [
        'Choose neighboring checks based on what changed. A shared spacing token needs more than the original screen. A local wrapper change may need a narrow layout and long content. A keyboard interaction change needs a focus and activation check.',
        'Ask which consumers were inspected and why they were representative. Do not claim that a library-wide change is safe because one example looks better. Equally, avoid retesting an entire application for an isolated copy adjustment when there is no evidence of wider impact.',
      ], items: ['Check the original viewport and a nearby width when layout changed.', 'Review another consumer when a shared component or token changed.', 'Check keyboard behavior when controls or focus handling changed.', 'Confirm that a visual improvement preserves the intended task.'] },
      { id: 'close-the-loop', title: '4. Record the decision and remaining limits', paragraphs: [
        'State what was fixed in terms of the original outcome, then list what was actually checked. If something remains unverified, say so and identify who will decide whether it blocks release. This makes a resolution useful to the next reviewer instead of merely changing a status.',
        'When an agent implements the correction, keep human review distinct from its completion report. CRRT’s handoff workflow preserves that boundary. If the result misses the accepted outcome, reopen or follow up with the observed difference, the changed build, and the specific check that still fails.',
      ] },
    ],
    questions: [
      { question: 'Are passing automated tests enough to resolve visual feedback?', answer: 'Only if those tests establish the accepted outcome and relevant impact. Many visual or interaction requests also need a direct review of the running product.' },
      { question: 'What should I include when a fix still fails?', answer: 'Identify the changed build, repeatable state, expected result, and remaining difference. Separate the original unresolved problem from unrelated new observations.' },
    ],
    sources: [{ label: 'CRRT: human review and agent completion', href: 'https://crrt.ai/docs/agent-handoff' }, { label: 'Playwright: what screenshot comparisons measure', href: 'https://playwright.dev/docs/test-snapshots' }],
    related: ['scope-a-visual-fix', 'visual-feedback-vs-visual-regression'],
  },
  {
    slug: 'client-prototype-review', track: 'ai-prototyping',
    title: 'How to onboard a client to their first prototype review',
    seoTitle: 'Prepare a client for their first prototype review',
    description: 'Give clients a clear prototype review request with the goal, build, task, boundaries, feedback format, and decision owner. Includes a copyable invitation.',
    answer: 'Prepare a client review by explaining the task, prototype maturity, review link, and questions that need an answer. Show how to capture a specific observation, identify who makes decisions, and explain what happens after comments are reviewed.',
    takeaway: 'A client review invitation with clear questions and boundaries.',
    sections: [
      { id: 'frame-the-review', title: '1. Explain what this build is ready to answer', paragraphs: [
        'State the purpose of the prototype in plain language. A client should know whether the review concerns the flow, visual direction, content, or a nearly complete implementation. Avoid presenting a simulated interaction as a finished capability.',
        'Identify the decisions that need input now and the areas that will be reviewed later. Give a short explanation for those boundaries. This helps a client focus their judgment without implying that observations outside the current round are unwelcome or automatically approved as new scope.',
      ] },
      { id: 'provide-a-safe-start', title: '2. Give a safe, repeatable starting point', paragraphs: [
        'Share the intended build and access instructions through the approved project channel. Use fictional review data and confirm that the client can reach the starting screen. Do not ask them to use a production action that could send real invitations, change billing, or affect customer records just to explore a prototype.',
        'Include the task and any important limitations. If a button is intentionally simulated, explain what the reviewer can learn from it. If the build changes during the review period, provide a clear update and retain the version associated with earlier feedback.',
      ], code: 'Subject: Review the teammate invitation flow\nBuild: [approved review URL and version]\nTask: invite a fictional teammate from the project overview\nPlease check: is the action clear; do errors explain recovery?\nCurrent limits: invitations are simulated; billing is outside this round\nFeedback: name the screen, observed problem, and expected outcome\nReview window: [date and time zone]\nDecision owner: [name or role]\nNext step: we review comments, confirm scope, then share a checked update' },
      { id: 'show-useful-feedback', title: '3. Show what a useful observation looks like', paragraphs: [
        'Use one example from the actual review task. “After I entered an invalid email, I could not tell which field needed correcting” is clear evidence. A request to make the entire screen more intuitive leaves several possible interpretations.',
        'Invite the client to explain what they expected, while keeping the team responsible for proposing an appropriate solution. If comments conflict, return to the task, evidence, and decision owner. A majority of comments about a color does not automatically settle an unresolved product requirement.',
      ] },
      { id: 'explain-the-follow-up', title: '4. Explain how decisions and updates will be shared', paragraphs: [
        'Tell reviewers when they will receive a summary and what that summary will contain. Group accepted corrections, open questions, and requests that need a scope decision. Assign owners so the client can see which issues are being handled and which require their input.',
        'CRRT can help collect element-anchored visual feedback on a supported project surface. Use the project’s approved access and review workflow rather than assuming every client should have implementation permissions. After changes are made, share a specific build and a concise record of the checks performed.',
      ], items: ['Keep feedback and review decisions associated with the correct build.', 'Explain how conflicting requests will be resolved.', 'Distinguish a reviewed correction from a new scope request.', 'Ask the client to verify the relevant outcome on the updated build.'] },
    ],
    questions: [
      { question: 'Should clients only comment on questions in the review brief?', answer: 'The questions provide focus. Capture other useful observations too, then make an explicit decision about whether they belong in this round or a later scope discussion.' },
      { question: 'Does a client comment count as final approval?', answer: 'Use the approval process agreed for the project. A comment, an accepted correction, and final approval are different decisions and should have clear ownership.' },
    ],
    sources: [{ label: 'CRRT: installing a review surface', href: 'https://crrt.ai/docs/install' }, { label: 'CRRT: review and implementation boundaries', href: 'https://crrt.ai/docs/agent-handoff' }],
    related: ['focused-prototype-review', 'visual-feedback-brief-builder'],
  },
  {
    slug: 'visual-feedback-vs-visual-regression', track: 'agentic-workflows',
    title: 'Visual feedback vs visual regression testing: when to use each',
    seoTitle: 'Visual feedback vs visual regression testing',
    description: 'Understand how human visual feedback and screenshot regression tests answer different review questions. Use both to describe intent and catch unexpected changes.',
    answer: 'Visual feedback records a person’s judgment about what should change. Visual regression testing compares rendered output with a baseline to flag differences. Use feedback to clarify intent, then use suitable regression checks to help detect unintended changes after implementation.',
    takeaway: 'A practical way to combine human judgment with screenshot checks.',
    sections: [
      { id: 'identify-the-question', title: '1. Identify the question you need to answer', paragraphs: [
        'Ask whether you need to decide what the interface should do or detect that its rendered output changed. A reviewer noticing an unclear primary action is making a design judgment. A screenshot test noticing that the action moved is reporting a difference from an existing baseline.',
        'Neither result automatically explains the other. A baseline can preserve an old usability problem, and a useful design correction can legitimately change many pixels. Keep the intended outcome explicit so reviewers can distinguish an improvement from an unintended regression.',
      ] },
      { id: 'understand-feedback', title: '2. Use feedback to describe the intended outcome', paragraphs: [
        'Human feedback is useful when the issue depends on hierarchy, clarity, task context, or a design decision. Capture the exact target, observation, expected outcome, and relevant state. Attach evidence that helps another person or coding agent locate and understand the problem.',
        'CRRT connects accepted visual feedback with implementation handoff. That workflow can make the requested change clearer, but it does not replace the reviewer’s judgment or prove that every nearby state remains correct. The accepted request still needs verification criteria.',
      ], code: 'Human review question: can the owner find Invite teammate?\nAccepted outcome: make the existing action easier to identify\nImplementation boundary: preserve the invitation behavior\nVisual check: compare the approved button treatment\nInteraction check: complete the invitation flow\nRegression check: inspect affected screenshots and shared consumers\nBaseline decision: update only after the intended change is reviewed' },
      { id: 'understand-regression-checks', title: '3. Use regression checks to flag unintended differences', paragraphs: [
        'A screenshot comparison can highlight changes that are easy to miss during a broad review. It is most useful when the page state and capture environment are controlled. Unstable data, animation, fonts, and platform differences can create output variation that needs interpretation.',
        'Follow the selected testing tool’s documentation for baseline generation and comparison settings. Playwright, for example, documents visual comparisons and environmental variation. Review proposed baseline updates carefully: accepting a new image can legitimize an unintended change as easily as an intended one.',
      ], items: ['Use stable content and a known application state.', 'Keep the capture environment consistent where practical.', 'Review differences before updating a baseline.', 'Retain task-level checks for behavior a screenshot cannot show.'] },
      { id: 'combine-the-evidence', title: '4. Combine both kinds of evidence in the review', paragraphs: [
        'Begin with an accepted outcome, implement a bounded correction, and review the actual task. Then inspect relevant screenshot differences and automated results. If the correction affects a shared component, choose consumers that represent its important usage rather than checking only the original screen.',
        'Write the resolution in terms of the requested outcome and list the evidence that supports it. Record unverified behavior and intentional visual changes. A person still decides whether the result should ship; a clean screenshot comparison and an agent completion message each provide only part of that evidence.',
      ] },
    ],
    questions: [
      { question: 'Can visual regression tests tell whether a design is good?', answer: 'They detect configured differences from a baseline. The baseline’s suitability and the quality of a new design still require product and design judgment.' },
      { question: 'Should every visual correction create a new screenshot baseline?', answer: 'Update relevant baselines when the intended change has been reviewed and the test is useful for future regressions. Avoid adding brittle checks that do not protect an important outcome.' },
    ],
    sources: [{ label: 'Playwright: visual comparisons', href: 'https://playwright.dev/docs/test-snapshots' }, { label: 'CRRT: accepted-feedback implementation workflow', href: 'https://crrt.ai/docs/agent-handoff' }],
    related: ['compare-design-to-browser', 'verify-a-ui-fix'],
  },
  {
    slug: 'text-contrast-checker', track: 'design-systems', tool: 'contrast',
    title: 'Text contrast checker for UI color pairs',
    seoTitle: 'Text contrast checker for UI color pairs',
    description: 'Check an opaque HEX text and background pair against WCAG AA text contrast thresholds. Preview normal or large text and copy the result for your review.',
    answer: 'Text contrast compares a foreground and background using their relative luminance. For WCAG AA, normal text generally needs at least 4.5:1 and qualifying large text at least 3:1. This checker evaluates opaque sRGB HEX pairs for the selected text criterion, not overall page accessibility.',
    takeaway: 'Check a color pair and copy a precise review note.',
    sections: [
      { id: 'enter-the-real-pair', title: '1. Enter the colors the text actually uses', paragraphs: [
        'Enter the foreground and background as three- or six-digit HEX values. Use the computed colors from the rendered state you are reviewing when possible. A token name alone does not establish which value is applied after theme rules, component styles, and local overrides.',
        'This tool accepts opaque colors. It does not flatten transparency, sample an image, or evaluate a gradient. If text is drawn over one of those backgrounds, establish the relevant rendered colors or use a testing method that accounts for the actual composition.',
      ] },
      { id: 'choose-the-text-category', title: '2. Choose the appropriate text category', paragraphs: [
        'Select normal text unless the rendered text qualifies for the large-text exception. W3C defines qualifying large text as at least 18 point regular or 14 point bold; at the standard CSS conversion, those correspond to 24 CSS pixels and approximately 18.67 CSS pixels respectively.',
        'The sample changes with the selected category to make the comparison easier to inspect. It does not inspect your website’s font size or weight. Confirm the classification in the actual component before using a large-text result as evidence for a review.',
      ] },
      { id: 'interpret-the-result', title: '3. Interpret the result within its scope', paragraphs: [
        'The displayed ratio is rounded for readability, while the pass or fail decision uses the unrounded calculation. A value close to the boundary can therefore display as 4.50 while remaining slightly below the required ratio. Keep that distinction when discussing a borderline pair.',
        'A passing pair does not establish that the whole component is accessible. Review focus indicators, state meaning, keyboard access, labels, and any applicable non-text contrast requirements separately. Text over changing content can also need more than a single sampled pair.',
      ], items: ['Confirm the pair and theme match the reported state.', 'Check supporting text and error messages as well as headings.', 'Use visible text to communicate the result, not color alone.', 'Treat the output as evidence for one criterion and one pair.'] },
      { id: 'record-the-correction', title: '4. Turn a failed pair into a useful correction', paragraphs: [
        'Copy the result and add the route, component, theme, and intended token role. Ask for a correction that preserves the component’s meaning. If a shared text token is the cause, review representative consumers before approving a global value change.',
        'Recheck the actual rendered pair after implementation. Keep the original observation with its verification result so the next reviewer can see what changed. These calculations run in your browser; the tool does not submit the entered colors to CRRT or create feedback automatically.',
      ] },
    ],
    questions: [
      { question: 'Does this checker certify WCAG conformance?', answer: 'No. It evaluates the selected AA text contrast threshold for one opaque color pair. Accessibility conformance requires reviewing all applicable requirements.' },
      { question: 'Can I enter rgba(), images, or translucent colors?', answer: 'This version accepts opaque three- or six-digit HEX colors. Establish the effective rendered colors before using it for text over transparency or images.' },
    ],
    sources: [{ label: 'W3C: minimum text contrast and large text', href: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html' }, { label: 'W3C: relative luminance calculation', href: 'https://www.w3.org/WAI/WCAG22/Understanding/relative-luminance.html' }],
    related: ['review-light-and-dark-themes', 'ui-review-checklist-ai-generated-apps'],
  },
  {
    slug: 'px-to-rem-converter', track: 'design-systems', tool: 'units',
    title: 'px to rem converter with an adjustable root size',
    seoTitle: 'px to rem converter with adjustable root size',
    description: 'Convert CSS pixels to rem or rem to pixels using an explicit root font size. Copy the result and understand what the conversion does and does not establish.',
    answer: 'Convert pixels to rem by dividing the pixel value by the root font size in pixels. Convert rem to pixels by multiplying by that root size. A 24px value is 1.5rem when the root is 16px; the result changes if the root font size changes.',
    takeaway: 'Convert a value using the root size your project actually uses.',
    sections: [
      { id: 'identify-the-root', title: '1. Identify the root font size', paragraphs: [
        'Check the computed font size of the document’s root element in the target environment. Do not assume that every product, theme, or user setting resolves to the same value. This calculator starts at 16px as an example and lets you replace that assumption.',
        'A rem unit refers to the root font size. It does not refer to the immediate parent’s font size, which is relevant to em in many property contexts. Record which unit and reference size you are discussing when a design and browser value appear inconsistent.',
      ] },
      { id: 'convert-the-value', title: '2. Convert the value in the right direction', paragraphs: [
        'Choose pixels to rem when translating a pixel measurement into a root-relative value. Choose rem to pixels when checking how a root-relative value resolves under a known root size. A nonzero positive root size is required for a useful conversion.',
        'The value can include decimals and negative numbers because CSS lengths can be used in different property contexts. Whether a negative value is valid for a particular property is a separate question. The calculator formats the result to six decimal places and removes unnecessary trailing zeros.',
      ], code: 'px → rem: value in px ÷ root font size in px\nrem → px: value in rem × root font size in px\n\n24px ÷ 16px = 1.5rem\n1.5rem × 20px = 30px\n\nRecord the root-size assumption with the converted value.' },
      { id: 'apply-the-project-rules', title: '3. Use the project’s existing sizing rules', paragraphs: [
        'A numerically equivalent conversion is not automatically the right implementation. Check the product’s typography and spacing tokens before introducing a new literal value. The intended decision may already have a semantic name that should be reused.',
        'Avoid treating rem as an accessibility guarantee. Review how text and layout respond to user settings, browser zoom, and content expansion. W3C’s resize-text guidance concerns usable content and functionality when text is enlarged; changing a unit in a stylesheet does not establish that outcome by itself.',
      ] },
      { id: 'review-the-result', title: '4. Review the rendered result after converting', paragraphs: [
        'Open the affected screen and check the real content at narrow and wide widths. Look for changes in wrapping, control height, alignment, and action placement. If the value belongs to a shared token, inspect another consumer that could expose a different layout constraint.',
        'When sharing a correction, include the original value, chosen root size, converted result, and applicable token role. Recheck the running product after implementation. The converter works in your browser and does not change your project’s CSS or send the entered values to CRRT.',
      ], items: ['State the root-size assumption explicitly.', 'Reuse an existing token when it matches the intended role.', 'Check text enlargement and long content in the real interface.', 'Verify property-specific limits separately from arithmetic.'] },
    ],
    questions: [
      { question: 'Is the root size always 16px?', answer: 'No. That is a common starting assumption, but styles and user settings can change the computed root size. Inspect the target environment when precision matters.' },
      { question: 'Does converting every value to rem make a UI accessible?', answer: 'No. Units are one implementation choice. The rendered layout and controls still need review for resizing, reflow, interaction, and other applicable requirements.' },
    ],
    sources: [{ label: 'MDN: CSS values and relative length units', href: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics/Values_and_units' }, { label: 'W3C: resize text', href: 'https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html' }],
    related: ['design-tokens-for-ai-prototypes', 'report-responsive-ui-issues'],
  },
  {
    slug: 'visual-feedback-brief-builder', track: 'agentic-workflows', tool: 'feedback',
    title: 'Visual feedback brief builder',
    seoTitle: 'Visual feedback brief builder for UI changes',
    description: 'Turn a UI observation into a copyable feedback brief with the target, observed problem, expected outcome, constraints, and verification steps.',
    answer: 'A useful visual feedback brief identifies the target, observed problem, expected outcome, constraints, and verification steps. Fill in the fields below to create a Markdown draft, then review the scope and evidence before sharing it or handing an accepted correction to a coding agent.',
    takeaway: 'Build a clear, copyable UI change request.',
    sections: [
      { id: 'identify-the-target', title: '1. Identify the target and reproduction context', paragraphs: [
        'Name the screen, element, and state. Include the viewport or interaction when it changes what someone needs to reproduce. A route and a specific control are more useful than a reference to “the thing on the right,” which may move at another width.',
        'The prefilled example is fictional starter content. Replace it with your own observation and remove private information before sharing. A screenshot or selected-element reference can support the brief, but this tool does not capture either automatically.',
      ] },
      { id: 'describe-the-outcome', title: '2. Describe the observed problem and intended outcome', paragraphs: [
        'Write what happened before proposing a solution. Explain why it affects the task, then state a result that the reviewer can observe. Keep an unresolved product decision separate from an accepted correction so the implementer knows when clarification is needed.',
        'Use one independently reviewable change per brief. If the observation contains unrelated layout, permissions, and copy requests, separate them before implementation. A shorter accepted task usually makes the scope easier to understand, but it still needs enough context to fix the actual issue.',
      ] },
      { id: 'set-boundaries', title: '3. Add constraints and verification steps', paragraphs: [
        'Name existing components, tokens, or approved references that should be reused. State important behavior and content that must remain intact. Do not include access tokens, private account credentials, or unrelated repository instructions in a reusable feedback note.',
        'Define the steps that would establish success. Include the original reproduction state and any nearby check justified by the expected impact. A shared-component correction may need representative consumers, while an isolated label change may need only a focused review.',
      ], items: ['Identify the current build or version when available.', 'Keep observed evidence distinct from the proposed solution.', 'Specify what should remain intact.', 'Make the expected outcome observable in the verification steps.'] },
      { id: 'review-before-sharing', title: '4. Review the draft before sharing', paragraphs: [
        'Read the generated brief as someone who has not seen the screen. Check that the target is discoverable, the request is decided, and the scope is realistic. Add links or evidence through the approved project channel when they are needed to explain the task.',
        'The builder produces a draft you can copy. It does not submit feedback, approve a change, connect an agent, or create a CRRT project. Use the product’s supported workflow to capture visual context and hand off accepted work when appropriate.',
        'Your entries stay in the current browser page; the builder does not store them in an account or send them to CRRT. Copy the output somewhere you control before leaving if you need to keep it. After implementation, repeat the verification steps and record the actual result.',
      ] },
    ],
    questions: [
      { question: 'Does this builder send feedback to CRRT?', answer: 'No. It creates a draft on this page. Review and copy it, then use your project’s chosen feedback or handoff workflow.' },
      { question: 'Can the draft replace the screenshot and element context?', answer: 'It can describe a task, but some visual issues need supporting evidence. Add the appropriate screenshot, element reference, state, or reproduction details when sharing the accepted request.' },
    ],
    sources: [{ label: 'CRRT: agent handoff and review responsibilities', href: 'https://crrt.ai/docs/agent-handoff' }, { label: 'CRRT: capture visual feedback on a supported surface', href: 'https://crrt.ai/docs/install' }],
    related: ['visual-feedback-for-coding-agents', 'scope-a-visual-fix'],
  },
]
