import { useEffect, useMemo, useState } from 'react';
import VisualizerDiorama from '../vendor/folia/components/visualizer/diorama/VisualizerDiorama';
import { DEFAULT_DIORAMA_TUNING } from '../vendor/folia/types';
import { glyphWaypoints } from './glyphWaypoints';
import type { VisualizerSharedProps } from '../vendor/folia/components/visualizer/definition';

// Studio's original Aurora treatment: Diorama receives one waypoint per grapheme.
// The background now comes from the independent background selector.
export default function AuroraStudio(props: VisualizerSharedProps) {
  const lines = useMemo(() => glyphWaypoints(props.lines), [props.lines]);
  const [index, setIndex] = useState(-1);
  useEffect(() => {
    const update = (time: number) => setIndex(lines.findLastIndex(line => time >= line.startTime));
    update(props.currentTime.get());
    return props.currentTime.on('change', update);
  }, [lines, props.currentTime]);
  return <VisualizerDiorama key={lines.map(line => `${line.fullText}:${line.startTime}:${line.endTime}`).join("|")} {...props} lines={lines} currentLineIndex={index} dioramaTuning={{...DEFAULT_DIORAMA_TUNING, cameraSpeed:1.15, motionAmount:0.55, audioReactivity:0, glowIntensity:0.65, soulEnabled:false, gradientEnabled:true, gradientIntensity:0.6}} hideTranslationSubtitle showSubtitleTranslation={false}/>;
}
