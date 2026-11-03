import { afterEach, expect, it } from 'vitest'
import { readResourceCatalog } from './readResourceCatalog'
import { resourceCatalog } from './catalog.generated'

afterEach(()=>document.getElementById('resource-catalog-data')?.remove())
const put=(text:string)=>{const script=document.createElement('script');script.id='resource-catalog-data';script.type='application/json';script.textContent=text;document.body.append(script)}
it('restores a generated document catalog without fetching or evaluating it',()=>{
  expect(readResourceCatalog()).toBeUndefined()
  put(JSON.stringify(resourceCatalog))
  expect(readResourceCatalog()).toEqual(resourceCatalog)
})
it('handles empty and malformed embedded data',()=>{
  put('');expect(readResourceCatalog()).toBeUndefined()
  document.getElementById('resource-catalog-data')!.textContent='</script><script>throw 1</script>'
  expect(readResourceCatalog()).toBeUndefined()
  for(const value of [null,{},[null],[{...resourceCatalog[0],title:123}]]){
    document.getElementById('resource-catalog-data')!.textContent=JSON.stringify(value)
    expect(readResourceCatalog()).toBeUndefined()
  }
})
