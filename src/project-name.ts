// Updates the name in the header comment of script.js, keeping a " - WxH" suffix.
export function renameInScript(
  script: string,
  oldName: string,
  newName: string,
): string {
  const header = /^(\/\*\*[ \t]*\r?\n[ \t]*\*[ \t]+)(.*?)([ \t]+-[ \t]+\d+x\d+)?([ \t]*)$/m;
  const match = header.exec(script);

  // A name edited by hand is left alone.
  if (!match || match.index !== 0 || match[2] !== oldName) {
    return script;
  }

  return (
    script.slice(0, match.index) +
    `${match[1]}${newName}${match[3] ?? ""}${match[4]}` +
    script.slice(match.index + match[0].length)
  );
}
