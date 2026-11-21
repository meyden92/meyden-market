import { expect, test } from 'claude-code/testing'

test('session.start exports the sound library folder', { options: { sfx_library: '/work/sfx' } }, async ($, on) => {
  const set = new Map<string, string>()
  on('env.set', ($, e) => {
    set.set(e.name, e.value)
    return { value: undefined }
  })
  on('session.start', () => ({ cwd: '/work' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(set.get('VIDEO_ENGINEER_SFX_LIBRARY')).toBe('/work/sfx')
})

test('session.start sets nothing without a sound library folder', async ($, on) => {
  const set = new Map<string, string>()
  on('env.set', ($, e) => {
    set.set(e.name, e.value)
    return { value: undefined }
  })
  on('session.start', () => ({ cwd: '/work' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(set.size).toBe(0)
})
