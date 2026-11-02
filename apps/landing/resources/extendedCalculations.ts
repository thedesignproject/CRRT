import { parseHex } from './toolCalculations'

export function colorConversion(value: string) {
  const hex = parseHex(value)
  if (hex) return { hex: hex.hex, css: `rgb(${hex.rgb.join(', ')})` }
  const match = value.trim().match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i)
  if (!match) return null
  const channels = match.slice(1).map(Number)
  if (channels.some(value => value > 255)) return null
  return { hex: '#' + channels.map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase(), css: `rgb(${channels.join(', ')})` }
}

export function similarColors(input: string, threshold: number) {
  const entries = input.split(/[\s,;]+/).filter(Boolean).map(parseHex)
  if (entries.length < 2 || entries.length > 60 || entries.some(item=>!item) || !Number.isFinite(threshold) || threshold < 0) return null
  const pairs: { a: string; b: string; distance: number }[] = []
  entries.forEach((a, index)=>entries.slice(index+1).forEach(b=>{
    const distance = Math.hypot(...a!.rgb.map((value, channel)=>value-b!.rgb[channel]))
    if (distance <= threshold) pairs.push({a:a!.hex,b:b!.hex,distance})
  }))
  return pairs
}

export function spacingSuggestions(values: string, scale: string) {
  const parse = (text: string) => text.trim().split(/[\s,;]+/).map(Number)
  const amounts=parse(values), steps=parse(scale)
  if (!values.trim() || !scale.trim() || amounts.length>60 || steps.length>60 || [...amounts,...steps].some(value=>!Number.isFinite(value)||value<0)) return null
  return amounts.map(value=>({value, mapped: steps.reduce((best,step)=>Math.abs(step-value)<Math.abs(best-value)?step:best)}))
}

export function tokenChanges(before: string, after: string) {
  function flatten(raw: string) {
    if(raw.length>100_000) throw new Error('Use JSON inputs under 100 KB.')
    const parsed=JSON.parse(raw)
    if(!parsed || typeof parsed!=='object' || Array.isArray(parsed)) throw new Error('Use a JSON object at the root.')
    const result=new Map<string,string>()
    function visit(value: any, path: string, depth: number) {
      if(depth>12) throw new Error('Supported nesting depth is 12.')
      if(value && typeof value==='object' && !Array.isArray(value) && !('$value' in value)) {
        for(const [key,child] of Object.entries(value)) visit(child,path+'/'+key.replace(/~/g,'~0').replace(/\//g,'~1'),depth+1)
      } else result.set(path,JSON.stringify(value))
    }
    visit(parsed,'',0)
    return result
  }
  try {
    const a=flatten(before),b=flatten(after)
    const rows=[...new Set([...a.keys(),...b.keys()])].sort().filter(key=>a.get(key)!==b.get(key)).map(key=>({ path:key, status:!a.has(key)?'Added':!b.has(key)?'Removed':'Changed', before:a.get(key)??'—', after:b.get(key)??'—' }))
    return {rows,error:''}
  } catch(error) { return {rows:[],error:String(error)} }
}

export function cyclePhases(values: string[]) {
  const timestamps=values.map(value=>value?Date.parse(value+'Z'):null)
  const present=timestamps.filter((value):value is number=>value!==null)
  if(!present.length || present.some(value=>!Number.isFinite(value)) || present.some((value,index)=>index>0&&value<present[index-1])) return null
  const minutes=(a:number|null,b:number|null)=>a===null||b===null?null:(b-a)/60_000
  return { phases:timestamps.slice(1).map((value,index)=>minutes(timestamps[index],value)), total:minutes(timestamps[0],timestamps[4]) }
}

export function markdownTable(columns: string[], rows: string[][]) {
  const cell=(value:string)=>value.replace(/\|/g,'\\|').replace(/[\r\n]+/g,' ').trim()
  return [columns.map(cell).join(' | '),columns.map(()=> '---').join(' | '),...rows.map(row=>row.map(cell).join(' | '))].map(row=>'| '+row+' |').join('\n')
}

export function annotatedSvg(image: string, note: string, x: number, y: number, width: number, height: number) {
  const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]!))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="850" viewBox="0 0 1000 850"><rect width="1000" height="850" fill="white"/><image href="${escape(image)}" width="1000" height="750" preserveAspectRatio="xMidYMid meet"/><rect x="${x*10}" y="${y*7.5}" width="${width*10}" height="${height*7.5}" fill="none" stroke="#b44414" stroke-width="4"/><text x="20" y="800" font-family="sans-serif" font-size="18" fill="#202329">${escape(note.slice(0,100))}</text></svg>`
}
