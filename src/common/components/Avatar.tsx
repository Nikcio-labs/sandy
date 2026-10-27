import Icon from "./Icon";

const palettes = ["", "blue", "sand", "green"] as const;
const glyphs = ["code", "terminal", "folder", "box"] as const;

/** A stable per-name tint and glyph: both rotate with the name's characters,
 *  so one sandbox keeps its tile everywhere it appears (list, inspector). */
export function Avatar({ name }: { name: string }) {
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + character.charCodeAt(0)) % 997;
  }
  const palette = palettes[hash % palettes.length];
  return (
    <span className={`avatar ${palette}`.trimEnd()}>
      <Icon name={glyphs[hash % glyphs.length]} size={18} />
    </span>
  );
}
