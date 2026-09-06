import { useEffect, useMemo, useRef, useState } from 'react';
import VisualizerDiorama from '../vendor/folia/components/visualizer/diorama/VisualizerDiorama';
import { DEFAULT_DIORAMA_TUNING } from '../vendor/folia/types';
import { glyphWaypoints } from './glyphWaypoints';
import type { VisualizerSharedProps } from '../vendor/folia/components/visualizer/definition';
import { curtainShader } from './curtainShader';
import { createNebulaCanvas } from './nebula';

// Original Diorama receives glyph-sized waypoints over the media-clocked nebula.
export default function AuroraStudio(props: VisualizerSharedProps & { auroraBackground?: 'nebula' | 'curtain' }) {
  const host = useRef<HTMLDivElement>(null), cloud = useRef<HTMLCanvasElement>(null);
  const lines = useMemo(() => glyphWaypoints(props.lines), [props.lines]);
  const [index, setIndex] = useState(-1);
  useEffect(() => {
    const update = (time: number) => setIndex(lines.findLastIndex(line => time >= line.startTime));
    update(props.currentTime.get());
    return props.currentTime.on('change', update);
  }, [lines, props.currentTime]);
  const latest = useRef(props); latest.current = props;
  useEffect(() => {
    const container = host.current!, background = cloud.current!;
    const nebula = createNebulaCanvas({ canvas: background, container, fragmentSource: props.auroraBackground === 'curtain' ? curtainShader : undefined, autoStart: false, trackPointer: false, renderScale: 0.6,
      schemes: [props.isDaylight
        ? { deepBlue: [0.13,0.085,0.12], orange: [0.6,0.29,0.18], warmYellow: [1,0.78,0.51], cyanRim: [0.6,0.85,0.84] }
        : props.theme.backgroundColor === '#102d2c'
          ? { deepBlue: [0.025,0.09,0.1], orange: [0.12,0.38,0.28], warmYellow: [0.62,0.8,0.38], cyanRim: [0.3,0.95,0.82] }
          : { deepBlue: [0.025,0.07,0.13], orange: [0.08,0.48,0.30], warmYellow: [0.38,0.86,0.57], cyanRim: [0.26,0.73,0.79] }] });
    let frame = 0, last = '', visible = true, previousProps = props, lastRender = 0, smoothTime = props.currentTime.get();
    const resize = new ResizeObserver(() => { nebula.resize(); last = ''; }); resize.observe(container);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }); observer.observe(container);
    const render = (stamp = 0) => {
      const p = latest.current, time = p.currentTime.get();
      const key = `${time}|${p.lyricsFontScale}|${p.theme.fontFamily}|${p.theme.backgroundColor}|${p.lines.length}`;
      if (visible && !document.hidden && (key !== last || p !== previousProps) ) {
        const dt = Math.min(.05, Math.max(0, (stamp-lastRender)/1000));
        if (p.paused || Math.abs(time-smoothTime)>.5) smoothTime=time;
        else smoothTime += (time-smoothTime)*(1-Math.exp(-dt*12));
        nebula.renderFrame(p.auroraBackground === 'curtain' ? smoothTime : smoothTime * 0.10 + 1.8);
        last = key; previousProps = p; lastRender = stamp;
      }
      frame = requestAnimationFrame(render);
    }; render();
    return () => { cancelAnimationFrame(frame); resize.disconnect(); observer.disconnect(); nebula.dispose(); };
  }, [props.theme.backgroundColor, props.auroraBackground]);
  return <div ref={host} style={{position:'absolute',inset:0,background:'#080c19'}}><canvas ref={cloud} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}/><VisualizerDiorama key={lines.map(line => `${line.fullText}:${line.startTime}:${line.endTime}`).join("|")} {...props} lines={lines} currentLineIndex={index} dioramaTuning={{...DEFAULT_DIORAMA_TUNING, cameraSpeed:1.15, motionAmount:0.55, audioReactivity:0, glowIntensity:0.65, soulEnabled:false, gradientEnabled:true, gradientIntensity:0.6}} background={{...props.background, transparent:true, common:{...props.background?.common, disableGeometricBackground:true, disableVignette:true}}} hideTranslationSubtitle showSubtitleTranslation={false}/></div>;
}
