import { ArrowDownToLine, FileAudio, SlidersHorizontal, TimerReset, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
type Box = { x:number; y:number; width:number; height:number };
const steps = [
  { key:'source', targets:['audio-import','lyrics-import'], icon:FileAudio },
  { key:'inspector', targets:['inspector'], icon:SlidersHorizontal },
  { key:'timing', targets:['timing'], icon:TimerReset },
  { key:'export', targets:['export'], icon:ArrowDownToLine },
] as const;
const boxFor = (element: Element):Box => { const rect=element.getBoundingClientRect(),pad=7; return {x:Math.max(5,rect.left-pad),y:Math.max(5,rect.top-pad),width:Math.min(innerWidth-10,rect.width+pad*2),height:Math.min(innerHeight-10,rect.height+pad*2)}; };
export function OnboardingTour({close}:{close:()=>void}) {
  const {t}=useTranslation(); const[step,setStep]=useState(0); const[boxes,setBoxes]=useState<Box[]>([]); const current=steps[step],Icon=current.icon;
  const dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null), card = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(270);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = dialog.current;
    node?.showModal(); heading.current?.focus({ preventScroll: true });
    return () => {
      node?.close();
      const target = previousFocus?.isConnected && previousFocus !== document.body ? previousFocus : document.querySelector<HTMLElement>('[data-tour="audio-import"]');
      target?.focus({ preventScroll: true });
    };
  }, []);
  useLayoutEffect(() => {
    if (!card.current) return;
    const observer = new ResizeObserver(() => setCardHeight(card.current?.getBoundingClientRect().height ?? 270));
    observer.observe(card.current); return () => observer.disconnect();
  }, []);
  useLayoutEffect(()=>{const update=()=>setBoxes(current.targets.map(id=>document.querySelector(`[data-tour="${id}"]`)).filter(Boolean).map(element=>boxFor(element!)));update();addEventListener('resize',update);addEventListener('scroll',update,true);return()=>{removeEventListener('resize',update);removeEventListener('scroll',update,true);};},[current]);
  useEffect(()=>{document.querySelector(`[data-tour="${current.targets[0]}"]`)?.scrollIntoView({block:'nearest'});},[current]);
  const finish=()=>{try { localStorage.setItem('usesuno-mv-guide-complete','1'); } catch { /* Closing the guide does not depend on persistent storage. */ } close();};
  const union=boxes.reduce<Box|null>((r,b)=>r?{x:Math.min(r.x,b.x),y:Math.min(r.y,b.y),width:Math.max(r.x+r.width,b.x+b.width)-Math.min(r.x,b.x),height:Math.max(r.y+r.height,b.y+b.height)-Math.min(r.y,b.y)}:b,null);
  const cardWidth=Math.min(400,innerWidth-28),gap=24;let left=Math.max(14,(innerWidth-cardWidth)/2),top=Math.max(14,innerHeight-cardHeight-24),side:'top'|'bottom'|'left'|'right'='top';
  if(union){if(union.x+union.width+cardWidth+gap<innerWidth){left=union.x+union.width+gap;top=Math.max(14,Math.min(innerHeight-cardHeight-14,union.y+union.height/2-cardHeight/2));side='left';}else if(union.x-cardWidth-gap>0){left=union.x-cardWidth-gap;top=Math.max(14,Math.min(innerHeight-cardHeight-14,union.y+union.height/2-cardHeight/2));side='right';}else if(union.y+union.height+cardHeight+gap<innerHeight){left=Math.max(14,Math.min(innerWidth-cardWidth-14,union.x+union.width/2-cardWidth/2));top=union.y+union.height+gap;side='top';}else{left=Math.max(14,Math.min(innerWidth-cardWidth-14,union.x+union.width/2-cardWidth/2));top=Math.max(14,union.y-cardHeight-gap);side='bottom';}}
  return <dialog ref={dialog} className="tour-layer" aria-labelledby="tour-title" onCancel={event => { event.preventDefault(); finish(); }}><svg className="tour-mask" width="100%" height="100%"><defs><mask id="tour-cutout"><rect width="100%" height="100%" fill="white"/>{boxes.map((b,i)=><rect key={i} x={b.x} y={b.y} width={b.width} height={b.height} rx="9" fill="black"/>)}</mask></defs><rect width="100%" height="100%" fill="#070a07d9" mask="url(#tour-cutout)"/></svg>{boxes.map((b,i)=><div className="tour-highlight" key={i} style={{left:b.x,top:b.y,width:b.width,height:b.height}}><span>{i+1}</span></div>)}<div ref={card} className={`tour-card arrow-${side}`} style={{left,top,width:cardWidth}}><div className="tour-card-content"><button className="tour-close icon-button" data-tooltip={t('common.close')} aria-label={t('common.close')} onClick={finish}><X size={15}/></button><span className="tour-icon"><Icon size={20}/></span><small>{t('guide.step',{current:step+1,total:steps.length})}</small><h2 ref={heading} tabIndex={-1} id="tour-title">{t(`guide.${current.key}.title`)}</h2><p>{t(`guide.${current.key}.body`)}</p><div className="tour-progress">{steps.map((_,i)=><i className={i<=step?'active':''} key={i}/>)}</div><div className="tour-actions"><button onClick={finish}>{t('guide.skip')}</button><button className="primary" onClick={()=>{ if (step===steps.length-1) finish(); else { setStep(v=>v+1); heading.current?.focus({ preventScroll: true }); } }}>{step===steps.length-1?t('guide.finish'):t('guide.next')}</button></div></div></div></dialog>;
}
