// 제품 기술 요소 칩 — 그룹별로 묶어 보여 준다
export default function FeatureChip({ feature, selected, disabled, onToggle }) {
  return (
    <button type="button" className="chip" aria-pressed={selected} disabled={disabled && !selected} onClick={() => onToggle(feature.id)} title={feature.spec}>
      {feature.label}
      {feature.spec ? <small>{feature.spec}</small> : null}
    </button>
  );
}
