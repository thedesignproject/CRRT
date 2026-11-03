import { expect, it } from 'vitest'
import { annotatedSvg, colorConversion, cyclePhases, markdownTable, similarColors, spacingSuggestions, tokenChanges } from './extendedCalculations'

it('preserves opaque channel values and rejects unsupported colors',()=>{
  expect(colorConversion('#369')).toEqual({hex:'#336699',css:'rgb(51, 102, 153)'})
  expect(colorConversion('rgb(0, 255, 16)')).toEqual({hex:'#00FF10',css:'rgb(0, 255, 16)'})
  for(const value of ['rgba(0,0,0,.5)','rgb(256,0,0)','rgb(-1,0,0)','rgb(1.5,0,0)','no color']) expect(colorConversion(value)).toBeNull()
})
it('uses an explicit RGB heuristic without automatic consolidation',()=>{
  expect(similarColors('#000 #001 #fff',2)).toEqual([{a:'#000000',b:'#000011',distance:17}].filter(pair=>pair.distance<=2))
  expect(similarColors('#000000 #000001 #ffffff',1)).toEqual([{a:'#000000',b:'#000001',distance:1}])
  for(const [input,threshold] of [['#fff',5],['#fff invalid',5],[Array(61).fill('#fff').join(' '),5],['#000 #fff',-1],['#000 #fff',NaN]] as const) expect(similarColors(input,threshold)).toBeNull()
})
it('maps spacing numerically while preserving manual-review boundaries',()=>{
  expect(spacingSuggestions('10, 14, 22','4,8,12,16,24')).toEqual([{value:10,mapped:8},{value:14,mapped:12},{value:22,mapped:24}])
  for(const [values,scale] of [['','4'],['1',''],['-1','4'],['1','bad'],[Array(61).fill('1').join(','),'4'],['1',Array(61).fill('4').join(',')],['Infinity','4']]) expect(spacingSuggestions(values,scale)).toBeNull()
})
it('diffs primitive and DTCG token values without evaluating aliases',()=>{
  const result=tokenChanges('{"same":1,"removed":2,"changed":{"$value":"{color.base}"},"nested":{"a/b~":true}}','{"same":1,"added":3,"changed":{"$value":"#ffffff"},"nested":{"a/b~":false}}')
  expect(result.error).toBe('')
  expect(result.rows.map(row=>[row.path,row.status])).toEqual([['/added','Added'],['/changed','Changed'],['/nested/a~1b~0','Changed'],['/removed','Removed']])
  expect(tokenChanges('{"a":[1,2],"b":null}','{"a":[1,2],"b":null}').rows).toEqual([])
  expect(tokenChanges('{','{}').error).toBeTruthy()
  for(const input of ['null','[]','"text"',' '.repeat(100_001)]) expect(tokenChanges(input,'{}').error).toBeTruthy()
  let deep:any=1;for(let i=0;i<14;i++)deep={x:deep}
  expect(tokenChanges(JSON.stringify(deep),'{}').error).toContain('nesting depth')
})
it('calculates available UTC wall-clock phases and preserves missing data',()=>{
  const values=['2026-11-02T09:00','2026-11-02T10:00','2026-11-02T10:30','2026-11-02T11:15','2026-11-02T12:00']
  expect(cyclePhases(values)).toEqual({phases:[60,30,45,45],total:180})
  expect(cyclePhases([values[0],'','',values[3],values[4]])).toEqual({phases:[null,null,null,45],total:180})
  expect(cyclePhases(['',values[1],values[2],'',''])).toEqual({phases:[null,30,null,null],total:null})
  expect(cyclePhases(['','','','',''])).toBeNull()
  expect(cyclePhases(['bad','','','',''])).toBeNull()
  expect(cyclePhases([...values].reverse())).toBeNull()
})
it('exports readable tables and escapes annotation markup',()=>{
  expect(markdownTable(['Target','Evidence'],[['A|B','line 1\nline 2']])).toContain('A\\|B | line 1 line 2')
  const svg=annotatedSvg('data:image/png;base64,abc','<script>"&\' test',10,20,30,40)
  expect(svg).toContain('x="100" y="150" width="300" height="300"')
  expect(svg).toContain('&lt;script&gt;&quot;&amp;&apos; test')
  expect(svg).not.toContain('<script>')
})
