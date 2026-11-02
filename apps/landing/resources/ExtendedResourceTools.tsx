import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import type { ResourceToolKind } from './model'
import { utilityDefinitions, worksheetSpecs, tableSpecs } from './utilityDefinitions'
import { parseHex, textContrast } from './toolCalculations'
import { colorConversion, similarColors, spacingSuggestions, tokenChanges, cyclePhases, markdownTable, annotatedSvg } from './extendedCalculations'
import { ToolCopy } from './ResourceTool'

export type ExtendedToolProps = { kind: ResourceToolKind }
export function ExtendedResourceTools({ kind }: ExtendedToolProps) {
  const definition=utilityDefinitions.find(item=>item.kind===kind)!
  let tool
  if (worksheetSpecs[kind]) tool=<DocumentBuilder kind={kind}/>
  else if (tableSpecs[kind]) tool=<ReviewTable kind={kind}/>
  else if (['overlay','before-after','crop','annotator'].includes(kind)) tool=<ImageReview kind={kind}/>
  else if (kind==='cycle-time') tool=<CycleCalculator/>
  else if (kind==='capture-format') tool=<CaptureSelector/>
  else if (kind==='guided-case') tool=<GuidedCase/>
  else tool=<DesignPlayground kind={kind}/>
  return <section className="resource-tool" id="interactive-tool" aria-label="Interactive tool"><h2>{definition.name}</h2><p>{definition.notes[0]}</p><p className="resource-tool-help">Prefilled content is fictional starter material to replace with your own inputs and evidence.</p>{tool}<p className="resource-tool-help">{definition.notes[2]} Entries and images stay on this page until you leave. Nothing is submitted automatically.</p><noscript><p>Enable JavaScript to edit the tool. The worked example and guide below remain readable.</p></noscript></section>
}

function ExportResult({text,filename='crrt-review.md',type='text/markdown'}:{text:string;filename?:string;type?:string}) {
  return <><pre tabIndex={0} className="resource-brief-preview" aria-label="Generated output">{text || 'Add the required inputs to generate an output.'}</pre><div className="resource-tool-actions"><ToolCopy text={text}/>{text && <a className="ds-button ds-button-secondary" download={filename} href={`data:${type};charset=utf-8,${encodeURIComponent(text)}`}>Download {filename.endsWith('.svg')?'SVG':'output'}</a>}</div></>
}
function TextField({label,value,onChange,rows=3}:{label:string;value:string;onChange:(value:string)=>void;rows?:number}) {
  return <label className="resource-tool-wide">{label}<textarea rows={rows} maxLength={100_000} value={value} onChange={event=>onChange(event.target.value)}/></label>
}
function Slider({label,value,onChange,min=0,max=100,step=1}:{label:string;value:number;onChange:(value:number)=>void;min?:number;max?:number;step?:number}) {
  return <label>{label}: {value}<input type="range" min={min} max={max} step={step} value={value} onChange={event=>onChange(Number(event.target.value))}/></label>
}
function DocumentBuilder({kind}:{kind:ResourceToolKind}) {
  const spec=worksheetSpecs[kind]!
  const [values,setValues]=useState(spec.fields.map(([,value])=>value))
  const output=values[0].trim()?`# ${spec.title}\n\n`+spec.fields.map(([label],index)=>`## ${label}\n${values[index].trim() || '[Not provided]'}`).join('\n\n'):''
  return <><div className="resource-tool-fields">{spec.fields.map(([label],index)=><TextField key={label} label={label} value={values[index]} onChange={value=>setValues(current=>current.map((previous,i)=>i===index?value:previous))}/>)}</div><p className="resource-tool-help">Fictional starter values. Replace them with your actual accepted scope and evidence. Unfilled fields remain marked.</p><ExportResult text={output}/></>
}
function ReviewTable({kind}:{kind:ResourceToolKind}) {
  const spec=tableSpecs[kind]!
  const [rows,setRows]=useState(spec.rows)
  const [active,setActive]=useState(0)
  const change=(column:number,value:string)=>setRows(previous=>previous.map((row,index)=>index===active?row.map((cell,i)=>i===column?value:cell):row))
  return <><label>Row to edit<select value={active} onChange={event=>setActive(Number(event.target.value))}>{rows.map((row,index)=><option value={index} key={index}>{index+1}. {row[0] || 'Untitled row'}</option>)}</select></label><div className="resource-tool-fields">{spec.columns.map((label,column)=>label==='Status'?<label key={label}>{label}<select value={rows[active][column]} onChange={event=>change(column,event.target.value)}>{['Not reviewed','Passed','Failed','Not applicable'].map(value=><option key={value}>{value}</option>)}</select></label>:<TextField key={label} label={label} value={rows[active][column]} onChange={value=>change(column,value)} rows={2}/>)}</div><div className="resource-tool-actions"><button className="ds-button ds-button-secondary" type="button" disabled={rows.length>=60} onClick={()=>{setRows(previous=>[...previous,spec.columns.map(column=>column==='Status'?'Not reviewed':'')]);setActive(rows.length)}}>Add row</button><button className="ds-button ds-button-secondary" type="button" disabled={rows.length===1} onClick={()=>{setRows(previous=>previous.filter((_,index)=>index!==active));setActive(0)}}>Remove row</button></div><p className="resource-tool-help">Statuses record your judgment. Choose Passed only after performing the check and recording evidence.</p><ExportResult text={`# ${spec.title}\n\n${markdownTable(spec.columns,rows)}`}/></>
}

function DesignPlayground({kind}:{kind:ResourceToolKind}) {
  const [input,setInput]=useState(kind==='similar-colors'?'#707680\n#727781\n#FFFFFF':kind==='spacing'?'10, 14, 22, 31':kind==='token-diff'?' {"color":{"text":{"$value":"#202329"}}}':kind==='token-map'?'text-primary=#202329\nsurface-page=#FFFFFF':'#336699')
  const [other,setOther]=useState(kind==='spacing'?'4, 8, 12, 16, 24, 32':'{"color":{"text":{"$value":"#303640"}},"space":{"small":8}}')
  const [sample,setSample]=useState('Your next change, clearly explained. Review long content in a narrow layout before accepting the new values.')
  const [a,setA]=useState(kind==='type-scale'?32:kind==='line-height'?1.35:kind==='icon-alignment'?20:16)
  const [b,setB]=useState(kind==='line-height'?1.6:kind==='icon-alignment'?8:16)
  const [c,setC]=useState(1)
  const [manual,setManual]=useState<Record<number,string>>({})
  const [palette,setPalette]=useState(['#202329','#FFFFFF','#B44414','#F5F5F5','#101114','#ED9B72'])
  const [alignment,setAlignment]=useState('center')
  let controls,preview,output='',error=''
  if(kind==='hex-rgb') {
    const result=colorConversion(input)
    controls=<TextField label="HEX or rgb(r, g, b)" value={input} onChange={setInput} rows={1}/>
    output=result?`${result.hex}\n${result.css}`:''
    error=result?'':'Enter opaque HEX or integer RGB channels from 0 to 255.'
    preview=result&&<div className="resource-color-swatch" style={{backgroundColor:result.hex}} aria-label={`Color preview ${result.hex}`}/>
  } else if(kind==='similar-colors') {
    const pairs=similarColors(input,a)
    controls=<><TextField label="Color list (up to 60 opaque HEX values)" value={input} onChange={setInput}/><Slider label="RGB distance threshold" value={a} onChange={setA} max={100}/></>
    output=pairs?pairs.length?pairs.map(pair=>`${pair.a} ↔ ${pair.b}: ${pair.distance.toFixed(2)} RGB distance`).join('\n'):'No candidate pairs within this threshold.':''
    error=pairs?'':'Enter 2–60 valid opaque HEX values.'
  } else if(kind==='spacing') {
    const suggestions=spacingSuggestions(input,other)
    controls=<><TextField label="Current spacing values (px)" value={input} onChange={value=>{setInput(value);setManual({})}} rows={2}/><TextField label="Approved scale (px)" value={other} onChange={value=>{setOther(value);setManual({})}} rows={2}/>{suggestions?.map((item,index)=><label key={index}>Mapping for {item.value}px<input type="number" min="0" step="any" value={manual[index]??item.mapped} onChange={event=>setManual(previous=>({...previous,[index]:event.target.value}))}/></label>)}</>
    const valid=suggestions&&suggestions.every((_,index)=>manual[index]===undefined||manual[index].trim()!==''&&Number.isFinite(Number(manual[index]))&&Number(manual[index])>=0)
    output=valid?suggestions.map((item,index)=>`${item.value}px → ${manual[index]??item.mapped}px (review grouping before applying)`).join('\n'):''
    error=valid?'':'Use finite nonnegative values and at most 60 values per list.'
  } else if(kind==='token-diff') {
    const diff=tokenChanges(input,other)
    controls=<><TextField label="Before token JSON (under 100 KB)" value={input} onChange={setInput} rows={6}/><TextField label="After token JSON (under 100 KB)" value={other} onChange={setOther} rows={6}/></>
    output=diff.error?'':diff.rows.length?diff.rows.map(row=>`${row.status}: ${row.path}\n  before: ${row.before}\n  after: ${row.after}`).join('\n'):'No structural token changes.'
    error=diff.error
  } else if(kind==='token-map') {
    const lines=input.trim().split('\n').map(line=>line.split('=').map(part=>part.trim()))
    const valid=lines.every(([name,value])=>/^[a-z][a-z0-9-]*$/i.test(name)&&value&&parseHex(value))&&new Set(lines.map(([name])=>name.toLowerCase())).size===lines.length
    controls=<TextField label="Editable role=color rows (unique CSS names)" value={input} onChange={setInput} rows={6}/>
    output=valid?`:root {\n${lines.map(([name,value])=>`  --${name}: ${parseHex(value)!.hex};`).join('\n')}\n}`:''
    error=valid?'':'Use unique role names and valid opaque HEX colors, one role=color per line.'
  } else if(kind==='themes') {
    const valid=palette.every(value=>parseHex(value))
    controls=<div className="resource-tool-fields">{['Light text','Light surface','Light action','Dark text','Dark surface','Dark action'].map((label,index)=><label key={label}>{label}<input maxLength={7} value={palette[index]} onChange={event=>setPalette(previous=>previous.map((value,i)=>i===index?event.target.value:value))}/></label>)}</div>
    preview=valid&&<div className="resource-theme-pair">{[0,3].map(offset=><div key={offset} style={{color:palette[offset],backgroundColor:palette[offset+1]}}><strong>{offset===0?'Light':'Dark'} theme preview</strong><p>Supporting content and a primary action.</p><span className="resource-preview-action" style={{backgroundColor:palette[offset+2],color:palette[offset+1]}}>Primary action</span><p>Text pair: {textContrast(palette[offset],palette[offset+1])!.ratio.toFixed(2)}:1</p></div>)}</div>
    output=valid?['Light','Dark'].map((name,index)=>`${name}: text ${palette[index*3]}, surface ${palette[index*3+1]}, action ${palette[index*3+2]}`).join('\n'):''
    error=valid?'':'Enter valid opaque HEX colors for all six roles.'
  } else if(kind==='type-scale'||kind==='line-height') {
    controls=<><TextField label="Sample content" value={sample} onChange={setSample}/><Slider label={kind==='type-scale'?'Heading size (px)':'Current line height'} value={a} onChange={setA} min={kind==='type-scale'?18:1} max={kind==='type-scale'?64:2.4} step={kind==='type-scale'?1:0.05}/><Slider label={kind==='type-scale'?'Body size (px)':'Proposed line height'} value={b} onChange={setB} min={kind==='type-scale'?12:1} max={kind==='type-scale'?24:2.4} step={kind==='type-scale'?1:0.05}/></>
    preview=kind==='type-scale'?<div className="resource-style-preview"><p style={{fontSize:a,fontWeight:600,lineHeight:1.15}}>A long project title to review</p><p style={{fontSize:b,lineHeight:1.6}}>{sample}</p><label style={{fontSize:b}}>Field label<input value="Example field value" readOnly/></label></div>:<div className="resource-theme-pair">{[a,b].map((height,index)=><div key={index}><strong>{index===0?'Current':'Proposed'}: {height.toFixed(2)}</strong><p style={{lineHeight:height}}>{sample}</p></div>)}</div>
    output=kind==='type-scale'?`/* Proposed role values; verify project font */\n--type-heading: ${a}px;\n--type-body: ${b}px;`:`Current line-height: ${a.toFixed(2)};\nProposed line-height: ${b.toFixed(2)};`
  } else if(kind==='decoration') {
    controls=<><Slider label="Radius (px)" value={a} onChange={setA} max={40}/><Slider label="Shadow blur (px)" value={b} onChange={setB} max={48}/><Slider label="Border width (px)" value={c} onChange={setC} max={8}/></>
    const style={borderRadius:a,border:`${c}px solid var(--border)`,boxShadow:`0 8px ${b}px rgb(0 0 0 / .12)`}
    preview=<div className="resource-style-preview" style={style}><strong>Proposed surface</strong><p>Inspect the actual component, surface, and states before applying.</p></div>
    output=`border-radius: ${a}px;\nborder: ${c}px solid var(--border);\nbox-shadow: 0 8px ${b}px rgb(0 0 0 / .12);`
  } else if(kind==='icon-alignment') {
    controls=<><TextField label="Action label" value={sample} onChange={setSample} rows={2}/><Slider label="Icon size (px)" value={a} onChange={setA} min={12} max={40}/><Slider label="Icon gap (px)" value={b} onChange={setB} max={24}/><label>Alignment<select value={alignment} onChange={event=>setAlignment(event.target.value)}><option value="center">Center</option><option value="baseline">Baseline</option><option value="flex-start">Start</option></select></label></>
    preview=<div className="resource-style-preview"><div style={{display:'flex',alignItems:alignment,gap:b}}><ArrowRight size={a} aria-hidden="true" style={{flexShrink:0}}/><span>{sample}</span></div></div>
    output=`display: flex;\nalign-items: ${alignment};\ngap: ${b}px;\n/* Icon dimensions: ${a}px */`
  } else {
    controls=<><TextField label="Base fictional label" value={sample} onChange={setSample} rows={2}/><Slider label="Repetitions" value={a} onChange={setA} min={1} max={8}/></>
    output=`Long label: ${Array.from({length:a},()=>sample).join(' ')}\n\nUnbroken: ProjectReference_${'X'.repeat(a*20)}\n\nEmpty optional value: [empty string]\n\nRepeated names: Northwind / Northwind\n\nMultiline error:\nThe request could not be completed.\nCheck the required field and try again.`
  }
  return <><div className="resource-tool-fields">{controls}</div>{preview}{error&&<p role="status" className="resource-tool-error">{error}</p>}<ExportResult text={output} filename={['token-map','decoration','type-scale','icon-alignment'].includes(kind)?'crrt-proposal.css':'crrt-review.txt'} type="text/plain"/></>
}

function CycleCalculator() {
  const labels=['Captured','Accepted','Implementation started','Ready for review','Closed']
  const [values,setValues]=useState(['2026-11-02T09:00','2026-11-02T10:00','2026-11-02T10:30','2026-11-02T11:15','2026-11-02T12:00'])
  const result=cyclePhases(values)
  const format=(value:number|null)=>value===null?'Unavailable (missing timestamp)':`${Number(value.toFixed(2))} elapsed minutes`
  const output=result?['Decision wait','Implementation queue','Implementation elapsed','Review elapsed'].map((label,index)=>`${label}: ${format(result.phases[index])}`).join('\n')+`\nTotal: ${format(result.total)}\nAll timestamps interpreted as UTC. Wall-clock time, not effort.`:''
  return <><p>Enter UTC timestamps. Missing phases remain unavailable; supplied timestamps must be chronological.</p><div className="resource-tool-fields">{labels.map((label,index)=><label key={label}>{label} (UTC)<input type="datetime-local" value={values[index]} onChange={event=>setValues(previous=>previous.map((value,i)=>i===index?event.target.value:value))}/></label>)}</div>{!result&&<p className="resource-tool-error" role="status">Enter valid chronological UTC timestamps.</p>}<ExportResult text={output}/></>
}
function CaptureSelector() {
  const [reason,setReason]=useState('static')
  const [context,setContext]=useState('Invitation guidance overlaps the action at 390px.')
  const suggestion=reason==='static'?'Use a marked screenshot for the static difference.':reason==='sequence'?'Use written steps and a short clip that shows the state transition.':'Use a short clip with the important moment identified, plus written steps and observed timing.'
  return <><label>What must the evidence show?<select value={reason} onChange={event=>setReason(event.target.value)}><option value="static">Static appearance</option><option value="sequence">Interaction sequence</option><option value="timing">Motion or timing</option></select></label><TextField label="Issue context" value={context} onChange={setContext}/><ExportResult text={`${suggestion}\n\nContext: ${context}\nInclude: target, build, viewport, state, expected outcome, and verification.`}/></>
}

function ImageReview({kind}:{kind:ResourceToolKind}) {
  const [images,setImages]=useState(['',''])
  const [error,setError]=useState('')
  const [mix,setMix]=useState(50),[x,setX]=useState(10),[y,setY]=useState(10),[width,setWidth]=useState(35),[height,setHeight]=useState(20)
  const [note,setNote]=useState('Review this element against the accepted outcome.')
  const [fit,setFit]=useState<'cover'|'contain'>('cover')
  const [boxWidth,setBoxWidth]=useState(600),[boxHeight,setBoxHeight]=useState(340)
  async function load(file:File|undefined,index:number) {
    if(!file) return
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024){setError('Use a PNG, JPEG, or WebP image up to 8 MB.');return}
    const reader=new FileReader()
    reader.onerror=()=>setError('Could not read this local image.')
    reader.onload=()=>{setImages(previous=>previous.map((value,i)=>i===index?String(reader.result):value));setError('')}
    reader.readAsDataURL(file)
  }
  const pair=kind==='overlay'||kind==='before-after'
  const output=kind==='crop'?`width: ${boxWidth}px;\nheight: ${boxHeight}px;\nobject-fit: ${fit};\nobject-position: ${x}% ${y}%;`:kind==='annotator'&&images[0]?annotatedSvg(images[0],note,x,y,width,height):`Comparison: ${kind}\n${kind==='overlay'?'Opacity':'Divider'}: ${mix}%\nAlignment offset: ${x-10}%, ${y-10}%\nEvidence: local images; record viewport and build separately.`
  return <><p>Local PNG/JPEG/WebP files, up to 8 MB each. Match viewport, content, and state before interpreting differences.</p><div className="resource-tool-fields">{Array.from({length:pair?2:1},(_,index)=><label key={index}>{pair?(index===0?'Reference image':'Comparison image'):'Local image'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>{void load(event.target.files?.[0],index)}}/></label>)}</div>{error&&<p role="status" className="resource-tool-error">{error}</p>}{pair?<><Slider label={kind==='overlay'?'Comparison opacity (%)':'Comparison divider (%)'} value={mix} onChange={setMix}/>{kind==='overlay'&&<><Slider label="Horizontal alignment" value={x} onChange={setX} max={20}/><Slider label="Vertical alignment" value={y} onChange={setY} max={20}/></>}</>:kind==='crop'?<><Slider label="Container width (px)" value={boxWidth} onChange={setBoxWidth} min={200} max={900}/><Slider label="Container height (px)" value={boxHeight} onChange={setBoxHeight} min={160} max={600}/><label>Image fit<select value={fit} onChange={event=>setFit(event.target.value as 'cover'|'contain')}><option value="cover">Cover</option><option value="contain">Contain</option></select></label><Slider label="Focal x (%)" value={x} onChange={setX}/><Slider label="Focal y (%)" value={y} onChange={setY}/></>:<><TextField label="Annotation note (export uses first 100 characters)" value={note} onChange={setNote} rows={2}/><Slider label="Marker x (%)" value={x} onChange={setX}/><Slider label="Marker y (%)" value={y} onChange={setY}/><Slider label="Marker width (%)" value={width} onChange={setWidth} min={1}/><Slider label="Marker height (%)" value={height} onChange={setHeight} min={1}/></>}
    <div className="resource-image-preview" style={kind==='crop'?{aspectRatio:`${boxWidth}/${boxHeight}`}:{aspectRatio:'4 / 3'}}>
      {!images[0]&&<p>Choose a local image to begin. Your file stays in this browser page.</p>}
      {images[0]&&<img src={images[0]} alt="Reference supplied for local review" style={kind==='crop'?{objectFit:fit,objectPosition:`${x}% ${y}%`}:{objectFit:'contain'}}/>}
      {pair&&images[1]&&<img src={images[1]} alt="Comparison supplied for local review" style={kind==='overlay'?{opacity:mix/100,transform:`translate(${x-10}%,${y-10}%)`}:{clipPath:`inset(0 ${100-mix}% 0 0)`}}/>}
      {kind==='annotator'&&images[0]&&<span className="resource-image-marker" style={{left:`${x}%`,top:`${y}%`,width:`${width}%`,height:`${height}%`}}/>}
    </div>
    {kind==='annotator'&&<p>{note}</p>}<ExportResult text={kind==='annotator'&&!images[0]?'':output} filename={kind==='annotator'?'crrt-annotation.svg':'crrt-image-review.txt'} type={kind==='annotator'?'image/svg+xml':'text/plain'}/></>
}
function GuidedCase() {
  const [stage,setStage]=useState('before'),[theme,setTheme]=useState('dark')
  const dark=theme==='dark'
  return <><p>Fictional recreation. No customer screenshot or measured outcome is represented.</p><div className="resource-tool-fields"><label>Stage<select value={stage} onChange={event=>setStage(event.target.value)}><option value="before">Before: fixed guidance color</option><option value="after">After: theme role applied</option></select></label><label>Theme<select value={theme} onChange={event=>setTheme(event.target.value)}><option value="light">Light</option><option value="dark">Dark</option></select></label></div><svg className="resource-case-figure" viewBox="0 0 520 220" role="img" aria-label={`Fictional invitation form: ${stage} correction in ${theme} theme. The before example illustrates a fixed guidance color; the after example illustrates a theme-specific role.`}><rect width="520" height="220" rx="12" fill={dark?'#101114':'#FFFFFF'}/><text x="24" y="42" fontSize="22" fill={dark?'#F5F5F5':'#202329'}>Invite a teammate</text><text x="24" y="88" fontSize="16" fill={dark?'#F5F5F5':'#202329'}>member@example.test</text><text x="24" y="128" fontSize="15" fill={stage==='before'?'#666666':dark?'#C2C7D0':'#4C535E'}>Use a valid email address to continue.</text><rect x="24" y="154" width="100" height="42" rx="8" fill={dark?'#ED9B72':'#B44414'}/><text x="44" y="181" fontSize="16" fill={dark?'#101114':'#FFFFFF'}>Invite</text></svg><ExportResult text={`Fictional case: ${stage} / ${theme}\nObservation: fixed guidance color in dark theme\nAccepted: use semantic supporting-text role\nPreserve: validation and submission\nVerify in your project: actual color pairs, recovery, both themes, second consumer\nNot customer evidence or a resolution claim.`}/></>
}
