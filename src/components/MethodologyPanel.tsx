import { BarChart3 } from 'lucide-react';
import type { Translation } from '../lib/i18n';

export function MethodologyPanel({ t, modelVersion }: { t: Translation; modelVersion: string }) {
  return (
    <section className="panel methodology-panel" id="methodology">
      <div className="panel-title-row">
        <h2>
          <BarChart3 size={18} />
          {t.methodologyTitle}
        </h2>
        <span>{modelVersion}</span>
      </div>
      <div className="methodology-grid">
        <p>{t.methodologyOwn}</p>
        <p>{t.methodologyExternal}</p>
        <p>{t.methodologyMissing}</p>
        <p>{t.methodologyPrediction}</p>
      </div>
    </section>
  );
}
