import Icon from "./Icon";

const palettes = ["", "blue", "sand", "green"] as const;

/** A stable per-name tint: the palette rotates with the name's characters. */
export function Avatar({ name }: { name: string }) {
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + character.charCodeAt(0)) % 997;
  }
  const palette = palettes[hash % palettes.length];
  return (
    <span className={`avatar ${palette}`.trimEnd()}>
      <Icon name={hash % 2 === 0 ? "code" : "box"} size={18} />
    </span>
  );
}
