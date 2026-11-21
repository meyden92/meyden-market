import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { checkerboard } from "./presentations/checkerboard";
import { clockWipe } from "./presentations/clock-wipe";
import { glitch } from "./presentations/glitch";
import { lightLeak } from "./presentations/light-leak";
import { pixelate } from "./presentations/pixelate";
import { rgbSplit } from "./presentations/rgb-split";
import { zoomBlur } from "./presentations/zoom-blur";

type Presentation = TransitionPresentation<Record<string, unknown>>;

/** Names accepted in a scene's motion.transitionIn. "cut" and "none" skip the transition. */
export const presentations: Record<string, () => Presentation> = {
  fade: () => fade() as Presentation,
  slide: () => slide({ direction: "from-right" }) as Presentation,
  wipe: () => wipe({ direction: "from-left" }) as Presentation,
  glitch: () => glitch() as Presentation,
  rgbSplit: () => rgbSplit() as Presentation,
  zoomBlur: () => zoomBlur() as Presentation,
  lightLeak: () => lightLeak() as Presentation,
  clockWipe: () => clockWipe() as Presentation,
  pixelate: () => pixelate() as Presentation,
  checkerboard: () => checkerboard() as Presentation,
};

const noop = () => {};

/**
 * In-scene entrance for a scene that is rendered as its own composition. Scenes are concatenated after
 * rendering, so they cannot overlap and a TransitionSeries cannot be used. This wrapper plays the
 * presentation's entering half over the first `seconds` of the scene, against the background colour:
 * the previous scene's exit ends on that colour, so the pair reads as one transition.
 * Put only visuals inside; audio goes outside so a presentation that clones its children does not duplicate it.
 */
export const TransitionIn: React.FC<{
  name: string;
  background: string;
  seconds?: number;
  children: React.ReactNode;
}> = ({ name, background, seconds = 0.4, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const make = presentations[name];
  const frames = Math.round(seconds * fps);
  if (!make || frame >= frames) return <>{children}</>;

  const presentation = make();
  const Component = presentation.component as React.ComponentType<TransitionPresentationComponentProps<Record<string, unknown>>>;
  const progress = interpolate(frame, [0, frames], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ backgroundColor: background }}>
      <Component
        presentationDirection="entering"
        presentationProgress={progress}
        presentationDurationInFrames={frames}
        passedProps={presentation.props}
        bothEnteringAndExiting={false}
        onElementImage={noop}
        onUnmount={noop}
      >
        {children}
      </Component>
    </AbsoluteFill>
  );
};
