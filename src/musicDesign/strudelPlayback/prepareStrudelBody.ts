/** 若代码未含 setcps，则前置当前 CPS */
export function prepareStrudelBody(code: string, cps: number): string {
  const trimmed = code.trim();
  if (!trimmed) return '';
  const hasSetCps = /^\s*setcps\s*\(/m.test(trimmed);
  return hasSetCps ? trimmed : `setcps(${cps})\n${trimmed}`;
}
