// Exports the sound library folder from the plugin settings to the session; scripts read only the environment.

export function register(on, options) {
  on('session.start', async ($, e, next) => {
    if (options.sfx_library) await $.env.set('VIDEO_ENGINEER_SFX_LIBRARY', options.sfx_library);
    return next(e);
  });
}
