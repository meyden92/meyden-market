import { Config } from "@remotion/cli/config";

Config.setEntryPoint("./src/index.ts");
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// WebGL (three.js, postprocessing) renders blank or fails headless with the default renderer.
Config.setChromiumOpenGlRenderer("angle");
