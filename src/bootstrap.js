/** Keep startup in one module so parallel plugin imports cannot delay the hook behind UI dependencies. */
import { installBillionAuto } from '../lib/billion-context-auto.js'

export const name = 'cost-meter'
export async function apply(ctx) {
  const release = installBillionAuto()
  let stopped = false
  ctx.effect(() => () => { stopped = true; release() }, 'cost-meter: original billion-context startup')
  try { const plugin = await import('./index.js'); if (!stopped) plugin.apply(ctx) }
  catch (error) { release(); throw error }
}
