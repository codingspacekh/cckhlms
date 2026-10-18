export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startupOrExit } = await import('./server/startup');
  await startupOrExit();
}
