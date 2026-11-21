// Placeholder world for a block that is not built yet: ink background and the block id, so the full song renders end to end.
import React from "react";
import { AbsoluteFill } from "remotion";
import { C } from "../theme";

export const Pending: React.FC<{ id: string }> = ({ id }) => (
  <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", background: C.ink, color: C.paper, fontFamily: "monospace", fontSize: 40, opacity: 0.35 }}>
    {id} pending
  </AbsoluteFill>
);
