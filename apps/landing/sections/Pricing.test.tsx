import {cleanup,render,screen}from'@testing-library/react'
import {afterEach,expect,it,vi}from'vitest'
vi.mock('../lib/useReveal',()=>({useReveal:()=>({ref:undefined,className:''})}))
import {Pricing}from'./Pricing'
afterEach(cleanup)
it('distinguishes self-hosted Community, paid Cloud and the local extension mode',()=>{
 render(<Pricing/>);expect(screen.getByRole('heading',{name:'Community'})).toBeInTheDocument()
 expect(screen.getByRole('heading',{name:'Cloud Pro'})).toBeInTheDocument();expect(screen.getByRole('heading',{name:'Cloud Studio'})).toBeInTheDocument()
 expect(screen.getByText('$19 / month')).toBeInTheDocument();expect(screen.getByText('$49 / month')).toBeInTheDocument()
 expect(screen.getByRole('link',{name:'Run Community'})).toHaveAttribute('href','https://github.com/thedesignproject/CRRT')
 expect(screen.getAllByRole('link',{name:'Start a 14-day trial'})).toHaveLength(2)
 expect(screen.getByText(/payment method/)).toBeInTheDocument();expect(screen.getByText(/50 stored comments/)).toBeInTheDocument()
})
