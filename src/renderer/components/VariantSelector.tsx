import React from 'react';
import { VariantOptions, VariantSelection } from '../../shared/types/variant';
import { Sliders } from 'lucide-react';

interface VariantSelectorProps {
  variants: VariantOptions;
  selected: VariantSelection;
  onChange: (selection: VariantSelection) => void;
}

export const VariantSelector: React.FC<VariantSelectorProps> = ({
  variants,
  selected,
  onChange,
}) => {
  return (
    <div className="card" style={{ marginTop: '12px', background: 'rgba(19, 27, 46, 0.6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: 'var(--text-secondary)' }}>
        <Sliders size={16} />
        <span style={{ fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Authorized Media Variants
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        {variants.qualities && variants.qualities.length > 0 && (
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Quality
            </label>
            <select
              className="select"
              value={selected.quality}
              onChange={(e) => onChange({ ...selected, quality: e.target.value })}
            >
              {variants.qualities.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </div>
        )}

        {variants.audio && variants.audio.length > 0 && (
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Audio Track
            </label>
            <select
              className="select"
              value={selected.audio}
              onChange={(e) => onChange({ ...selected, audio: e.target.value })}
            >
              {variants.audio.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        )}

        {variants.subtitles && variants.subtitles.length > 0 && (
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Subtitles
            </label>
            <select
              className="select"
              value={selected.subtitles}
              onChange={(e) => onChange({ ...selected, subtitles: e.target.value })}
            >
              {variants.subtitles.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
};
