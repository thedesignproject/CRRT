import type { ComponentMeta } from '../lib/meta'

export const pricingCardMeta: ComponentMeta = {
  name: 'PricingCard', description: 'Comparable plan surface with price, limits, recommendation, and one action.', status: 'beta', category: 'display',
  whenToUse: ['Use only inside a pricing comparison.', 'Use recommendation on one paid plan at most.'], whenNotToUse: ['Do not use as a general feature card.'],
  semanticTags: ['pricing', 'plan', 'subscription'], tokens: ['--card', '--border', '--primary', '--foreground'], accessibility: ['Uses an article and heading for each plan.'],
  examples: ['<PricingCard name="Pro" price="$19" suffix="/ month" description="For product teams" action={<Button>Start trial</Button>}>…</PricingCard>'],
}
