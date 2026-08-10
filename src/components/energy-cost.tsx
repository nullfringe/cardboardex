const energyNames: Record<string, string> = {
  C: "Colorless",
  D: "Darkness",
  F: "Fighting",
  G: "Grass",
  L: "Lightning",
  M: "Metal",
  P: "Psychic",
  R: "Fire",
  W: "Water",
};

export function EnergyCost({ cost }: { cost: string[] }) {
  if (!cost.length) {
    return <span className="attack__free-cost">No energy cost</span>;
  }

  return (
    <span
      className="energy-cost"
      aria-label={cost.map((code) => energyNames[code] ?? code).join(", ")}
    >
      {cost.map((code, index) => (
        <span
          className={`energy-symbol energy-symbol--${code.toLocaleLowerCase()}`}
          key={`${code}-${index}`}
          title={energyNames[code] ?? code}
          aria-hidden="true"
        >
          {code}
        </span>
      ))}
    </span>
  );
}
